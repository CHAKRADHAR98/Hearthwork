use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use anchor_spl::{
    metadata::{
        create_metadata_accounts_v3,
        mpl_token_metadata::{instructions::*, types::DataV2, ID},
        CreateMetadataAccountsV3, Metadata,
    },
    token_interface::{Mint, TokenInterface},
};
use rust_decimal::prelude::*;

use crate::{
    constant::{GATHER_CONFIG, MARKET, MARKET_VAULT, MINIMUM_LMSR_B, MINT_NO, MINT_YES},
    decimal_convo,
    error::GatherError,
    state::{GatherConfig, GatherMarket},
    utils::{InitTokenArg, MarketArg, MarketOutcome, MarketStatus},
};

#[derive(Accounts)]
#[instruction(name:String)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GATHER_CONFIG],
        bump = gather_config.config_bump
    )]
    pub gather_config: Box<Account<'info, GatherConfig>>,

    #[account(
        init,
        payer = admin,
        space = 1024,
        seeds = [MARKET, gather_config.key().to_bytes().as_ref(), &name.as_bytes()[..name.len().min(32)]],
        bump
    )]
    pub gather_market: Box<Account<'info, GatherMarket>>,

    #[account(
        init,
        payer = admin,
        seeds = [MINT_YES,gather_market.key().to_bytes().as_ref()],
        bump,
        mint::authority = gather_config,
        mint::decimals = 6
    )]
    pub mint_yes: Box<InterfaceAccount<'info, Mint>>,

    #[account(
            init,
            payer = admin,
            seeds = [MINT_NO,gather_market.key().to_bytes().as_ref()],
            bump,
            mint::authority = gather_config,
            mint::decimals = 6
    )]
    pub mint_no: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [MARKET_VAULT,gather_market.key().to_bytes().as_ref()],
        bump
    )]
    pub market_vault_account: SystemAccount<'info>, // Where bettor desposites there wagers

    /// CHECK: yes metadata
    #[account(mut)]
    pub metadata_yes: UncheckedAccount<'info>,

    /// CHECK: no metadata
    #[account(mut)]
    pub metadata_no: UncheckedAccount<'info>,

    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> CreateMarket<'info> {
    pub fn save_market_data(
        &mut self,
        bump: CreateMarketBumps,
        arg: MarketArg,
        metadata_arg: InitTokenArg,
    ) -> Result<()> {
        // No global admin check here — whoever signs this transaction becomes the realm_authority
        // for this market. The caller (realm owner) is responsible for ensuring they are the
        // correct realm owner before sending this transaction.

        // Check: The Liquidity Parameter should pass the minimum threshold
        require_gte!(arg.lmsr_b, MINIMUM_LMSR_B, GatherError::ParameterTooLow);

        require!(arg.name.len() < 50, GatherError::MaxLenght);

        // Initialize the market, storing the signer as the realm_authority
        self.gather_market.init_gathermarket(GatherMarket {
            market_name: arg.name,
            description: arg.description,
            intial_deposite: 0,

            lsmr_b: arg.lmsr_b,
            dead_line: arg.dead_line,

            market_state: MarketStatus::Active,
            market_outcome: MarketOutcome::NotResolved,

            outcome_yes_shares: 0,
            outcome_no_shares: 0,

            realm_authority: self.admin.key(),

            mint_yes_bump: bump.mint_yes,
            mint_no_bump: bump.mint_no,
            market_vault_bump: bump.market_vault_account,
            market_bump: bump.gather_market,
        });

        // Create a clone of the inner ChauMarket data
        let market_data = (**self.gather_market).clone();

        // Now call the method with the cloned data
        self.deposite_intial_amount(market_data)?;

        Ok(())
    }

    fn create_metadata(&mut self, metadata_arg: InitTokenArg) -> Result<()> {
        let seeds = &[GATHER_CONFIG, &[self.gather_config.config_bump]];
        let signer_seeds = &[&seeds[..]];

        let mint_yes_ctx = CpiContext::new_with_signer(
            self.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                mint: self.mint_yes.to_account_info(),
                payer: self.admin.to_account_info(),
                update_authority: self.gather_config.to_account_info(),
                mint_authority: self.gather_config.to_account_info(),
                metadata: self.metadata_yes.to_account_info(),
                system_program: self.system_program.to_account_info(),
                rent: self.rent.to_account_info(),
            },
            signer_seeds,
        );

        let mint_yes_data = DataV2 {
            name: metadata_arg.yes_name.clone(),
            uri: metadata_arg.yes_uri.clone(),
            symbol: metadata_arg.yes_symbol.clone(),
            seller_fee_basis_points: 0,
            creators: None,
            uses: None,
            collection: None,
        };

        // mint yes transaction
        create_metadata_accounts_v3(mint_yes_ctx, mint_yes_data, true, true, None)?;

        let mint_no_ctx = CpiContext::new_with_signer(
            self.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                mint: self.mint_no.to_account_info(),
                payer: self.admin.to_account_info(),
                update_authority: self.gather_config.to_account_info(),
                mint_authority: self.gather_config.to_account_info(),
                metadata: self.metadata_no.to_account_info(),
                system_program: self.system_program.to_account_info(),
                rent: self.rent.to_account_info(),
            },
            signer_seeds,
        );

        let mint_no_data = DataV2 {
            name: metadata_arg.no_name,
            uri: metadata_arg.no_uri,
            symbol: metadata_arg.no_symbol,
            seller_fee_basis_points: 0,
            creators: None,
            uses: None,
            collection: None,
        };

        // mint no transaction
        create_metadata_accounts_v3(mint_no_ctx, mint_no_data, true, true, None)?;

        Ok(())
    }

    fn deposite_intial_amount(&mut self, lmsr: GatherMarket) -> Result<()> {
        // Deposit initial liquidity = b * ln(2) * LAMPORTS_PER_SOL
        // ≈ b * 693_147_181 lamports
        // This is the LMSR market-maker subsidy that guarantees solvency.

        let initial_liquidity = lmsr
            .lsmr_b
            .checked_mul(693_147_181u64)
            .ok_or(GatherError::ArthemeticError)?;

        require!(
            self.admin.to_account_info().lamports() > initial_liquidity,
            GatherError::NotEnoughAmount
        );

        let accounts = Transfer {
            from: self.admin.to_account_info(),
            to: self.market_vault_account.to_account_info(),
        };

        let ctx = CpiContext::new(self.system_program.to_account_info(), accounts);

        transfer(ctx, initial_liquidity)?;

        self.gather_market.intial_deposite = initial_liquidity;

        Ok(())
    }
}
