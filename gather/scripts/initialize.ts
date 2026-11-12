import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Gather } from "../target/types/gather";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";

// Load the IDL
const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../target/idl/gather.json"), "utf8")
);

// Program ID from deployment
const PROGRAM_ID = new PublicKey("BZ21yPSaWuGgpwaHT9yAZ5KUoGjNZ5R2fFukhhcZQiKg");

// Devnet connection
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

async function initializeProgram() {
  try {
    // Load wallet from id.json (upgrade authority)
    const keypairPath = path.join(process.env.HOME!, ".config/solana/id.json");
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")));
    const wallet = Keypair.fromSecretKey(secretKey);

    console.log("Admin wallet:", wallet.publicKey.toString());
    console.log("Program ID:", PROGRAM_ID.toString());

    // Create provider
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
      commitment: "confirmed",
    });
    anchor.setProvider(provider);

    // Create program instance with proper typing
    const program = new Program(idl as any, provider);

    // Derive config PDA
    const [gatherConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      PROGRAM_ID
    );

    // Derive treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), gatherConfigPda.toBytes()],
      PROGRAM_ID
    );

    console.log("\nPDAs:");
    console.log("Gather Config:", gatherConfigPda.toString());
    console.log("Treasury:", treasuryPda.toString());

    // Check if already initialized
    try {
      const configAccount = await (program.account as any).gatherConfig.fetch(gatherConfigPda);
      console.log("\nProgram already initialized!");
      console.log("Admins:", configAccount.admin.map((a: any) => a.toString()));
      console.log("Fees:", configAccount.fees.toString());
      return;
    } catch (e) {
      console.log("\nInitializing program...");
    }

    // Call initialize_config with 5% fees
    const tx = await (program.methods as any)
      .initializeConfig(500) // 5% fees (500 basis points)
      .accounts({
        admin: wallet.publicKey,
        gatherConfig: gatherConfigPda,
        treasuryAccount: treasuryPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("\n✅ Program initialized successfully!");
    console.log("Transaction:", tx);

    // Fetch and display the config
    const configAccount = await (program.account as any).gatherConfig.fetch(gatherConfigPda);
    console.log("\nConfig details:");
    console.log("- Initialized:", configAccount.isInitialized);
    console.log("- Admins:", configAccount.admin.map((a: any) => a.toString()));
    console.log("- Fees:", configAccount.fees.toString() + " basis points (" + configAccount.fees / 100 + "%)");
    console.log("- Treasury bump:", configAccount.trasuryBump);
    console.log("- Config bump:", configAccount.configBump);

  } catch (error) {
    console.error("❌ Error initializing program:", error);
    process.exit(1);
  }
}

initializeProgram();
