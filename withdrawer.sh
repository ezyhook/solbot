set -e
BOT_TOKEN=$(grep -v '^#' .env | grep -e "API_KEY_BOT" | sed -e 's/.*=//')
CHAT_ID=""

vote_account="/root/solana/vote-account-keypair.json"
withdrawer="/root/solana/authorized-withdrawer-keypair.json"
identity_account="/root/solana/validator-keypair.json"
wd=$(solana withdraw-from-vote-account --authorized-withdrawer $withdrawer $vote_account $identity_account 3)
sleep 1
balance=$(solana balance)
curl --header 'Content-Type: application/json' --request 'POST' --data '{"chat_id":"'"$CHAT_ID"'","text":"<b>🟢 Withdrawed</b><code>
'"$wd"'
<b>Balance: '"$balance"'</b></code>",  "parse_mode": "html"}' "https://api.telegram.org/bot$BOT_TOKEN/sendMessage"
