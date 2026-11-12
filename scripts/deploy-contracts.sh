#!/usr/bin/env bash
# Build and deploy the three Hearthwork contracts under ROOT (a NEAR testnet account you control).
#   ROOT=yourname.testnet ./scripts/deploy-contracts.sh
# Creates items.ROOT, market.ROOT and pool.ROOT, deploys + initialises them, registers the village goods.
# ROOT is the game server/operator. Needs: near CLI (near-cli-rs), cargo-near, ~8 testnet NEAR on ROOT.
set -euo pipefail
ROOT="${ROOT:?set ROOT=yourname.testnet}"
NET=testnet
cd "$(dirname "$0")/../contracts"

for c in village_items prediction_market team_pool; do
  (cd "$c" && cargo near build non-reproducible-wasm)
done

sub() { # name amount
  near account create-account fund-myself "$1.$ROOT" "$2 NEAR" autogenerate-new-keypair save-to-legacy-keychain \
    sign-as "$ROOT" network-config $NET sign-with-legacy-keychain send || echo "($1.$ROOT may already exist)"
}
deploy() { # name wasm init-json
  near contract deploy "$1.$ROOT" use-file "$2" with-init-call new json-args "$3" prepaid-gas '100 Tgas' \
    attached-deposit '0 NEAR' network-config $NET sign-with-legacy-keychain send
}
call() { # contract method json
  near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
    sign-as "$ROOT" network-config $NET sign-with-legacy-keychain send
}

sub items 2.9; sub market 2.7; sub pool 1.9
deploy items village_items/target/near/village_items.wasm "{\"owner_id\":\"$ROOT\",\"operator_id\":\"$ROOT\"}"
deploy market prediction_market/target/near/prediction_market.wasm "{\"admins\":[\"$ROOT\"],\"operator\":\"$ROOT\",\"fee_bps\":200,\"share_value\":\"1000000000000000000000\"}"
deploy pool team_pool/target/near/team_pool.wasm "{\"owner\":\"$ROOT\",\"operator\":\"$ROOT\"}"

for g in "wheat Wheat WHEAT 🌾" "iron Iron_ore IRON 🪨" "fish Fish FISH 🐟" "wool Wool WOOL 🧶" "bread Bread BREAD 🍞" "tools Tools TOOLS 🔨" "cloth Cloth CLOTH 🧵"; do
  set -- $g
  call "items.$ROOT" register_token "{\"token_id\":\"$1\",\"name\":\"${2//_/ }\",\"symbol\":\"$3\",\"icon\":\"$4\"}"
done
echo "Done. Set NEAR_ROOT_ACCOUNT=$ROOT in backend/.env (the key is read from ~/.near-credentials/testnet/$ROOT.json)."
