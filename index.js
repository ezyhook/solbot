const solanaWeb3 = require("@solana/web3.js");
const { PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const { exec } = require("child_process");
const Datastore = require('nedb');
const dbfile='cookie.json'
let db = new Datastore({filename : dbfile, autoload: true, timestampData: true});
const bot = new TelegramBot(process.env.API_KEY_BOT, {
  polling: true,
});

const commands = [
  { command: "start", description: "Запуск бота" },
  { command: "withdraw", description: "Снять с Vote Account" },
  { command: "balance", description: "Показать баланс" },
  { command: "rewards", description: "Показать награды" },
  { command: "stakes", description: "Stakes" },
  { command: "time_main", description: "Mainnet interval" },
  { command: "time_test", description: "Testnet interval" },
];
let myid = process.env.userid;
bot.setMyCommands(commands);

let _round = Math.round;
Math.round = function (number, decimals /* optional, default 0 */) {
  if (arguments.length == 1) {
    return _round(number);
  }
  let multiplier = Math.pow(10, decimals);
  return _round(number * multiplier) / multiplier;
};
async function getNode(identityPublicKey, RPC_URL) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  const nodes = await connection.getClusterNodes();
  
  for (const mynode of nodes) {
    if (mynode.pubkey === identityPublicKey) {
      return `v${mynode.version}\nGossip: ${mynode.gossip}`;
    }
  }
  throw new Error("Vote account not found");
}

async function getVoteStatus(identityPublicKey, RPC_URL) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  const voteAccounts = await connection.getVoteAccounts();
  for (const account of voteAccounts.current) {
    if (account.nodePubkey === identityPublicKey) {
      let stake = account.activatedStake;
      return { status_voit: false, custake: stake };
    }
  }
  for (const account of voteAccounts.delinquent) {
    if (account.nodePubkey === identityPublicKey) {
      let stake = account.activatedStake;
      return { status_voit: true, custake: stake };
    }
  }
  throw new Error("Vote account not found");
}
async function stakes(key, vote_key, RPC_URL) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  const epochInfo = await connection.getEpochInfo();
  const STAKE_PROGRAM_ID = new PublicKey(
    "Stake11111111111111111111111111111111111111"
  );
  const accounts = await connection.getParsedProgramAccounts(STAKE_PROGRAM_ID, {
    filters: [
      {
        dataSize: 200, // number of bytes
      },
      {
        memcmp: {
          offset: 124,
          bytes: vote_key, // base58 encoded string
        },
      },
    ],
  });
  
  if (accounts.length > 0) {
    let st1, st2, staker, a_epoch, d_epoch, stake, echo_stake;
    let sum = 0;
    let mes = "";
    for (let i=0; i < accounts.length; i++) {
      staker = accounts[i]["account"]["data"]["parsed"]["info"]["meta"]["authorized"]["staker"];
      st1 = staker.slice(0,3);
      st2 = staker.slice(-4);
      a_epoch = accounts[i]["account"]["data"]["parsed"]["info"]["stake"]["delegation"]["activationEpoch"];
      d_epoch = accounts[i]["account"]["data"]["parsed"]["info"]["stake"]["delegation"]["deactivationEpoch"];
      if (d_epoch == 18446744073709551615) {d_epoch = '∞';}
      stake = accounts[i]["account"]["data"]["parsed"]["info"]["stake"]["delegation"]["stake"] / LAMPORTS_PER_SOL;
      echo_stake = Math.round(stake, 4);
      sum += stake;
      mes += `${i+1}. ${st1}..${st2}  ${a_epoch} - ${d_epoch}  ${echo_stake}\n`;
    }
    sendmsg = `<code>CurrentEpoch: ${epochInfo.epoch}\n    Staker  StartEp EndEp  Stake\n${mes}\nAll: ${Math.round(sum, 2)} sol</code>`;
    return sendmsg;
  }
}
async function balanceinfo(key, vote_key, RPC_URL) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  const walletKey = new solanaWeb3.PublicKey(key);
  const balance = await connection.getBalance(walletKey);
  const solBalance = Math.round(balance / LAMPORTS_PER_SOL, 4);
  const { custake } = await getVoteStatus(key, RPC_URL);
  let sendmsg = `<code>Identity Balance: ${solBalance}\nActivatedStake: ${Math.round(
    custake / LAMPORTS_PER_SOL,
    4
  )}</code>`;
  return sendmsg;
}
async function rewardinfo(key, vote_key, RPC_URL, callBackFn) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  let vote_key1 = new solanaWeb3.PublicKey(vote_key);
  const epochInfo = await connection.getEpochInfo();
  const epoch = epochInfo.epoch;

  function showrew(values, stat) {
    let sum_rew = 0;
    let sendmsg = `<code>${stat}\nEpoch Comm   Rewards Balance\n`;
    for (let g = 0; g < 10; g++) {
      sendmsg += `${values[g][0]}     ${values[g][1]}      ${Math.round(values[g][2] / LAMPORTS_PER_SOL, 2)}   ${Math.round(values[g][3] / LAMPORTS_PER_SOL, 2)}\n`;
      sum_rew += values[g][2] / LAMPORTS_PER_SOL;
    }
    sendmsg += `\n Sum rewards:  ${Math.round(sum_rew, 2)} sol</code>`;
    return sendmsg;
  }
  function getrewards() {
    let rew = [];
    async function foo(index) {
      let cu_epoch = epoch - index;
      let rew_in_epo = [];
      let it = await connection
        .getInflationReward([vote_key1], cu_epoch)
        .then(function (value) {
          try {
            rew_in_epo.push(cu_epoch);
            if (value[0] == null) {
              rew_in_epo.push(0);
              rew_in_epo.push(0);
              rew_in_epo.push(0);
            } else {
              rew_in_epo.push(value[0].commission);
              rew_in_epo.push(value[0].amount);
              rew_in_epo.push(value[0].postBalance);
            }
            return rew_in_epo;
          } catch (error) {
            rew_in_epo.push(null);
            rew_in_epo.push(null);
            rew_in_epo.push(null);
            return rew_in_epo;
          }
        });
      return it;
    }
    for (let i = 1; i < 11; i++) {
      rew.push(foo(i));
    }
    Promise.all(rew).then((values) => {
      db.insert({ vote_pub: vote_key, data: values }, function (err, doc) {});
    });
    return rew;
  }

    db.find({ vote_pub: vote_key }, function (err, doc) {
    if (typeof doc[0] == 'undefined') {
      Promise.all(getrewards()).then((values) => {
        callBackFn(showrew(values,'Request0'));
      });
    } else if (typeof doc[0]['data'] == 'undefined') {
      Promise.all(getrewards()).then((values) => {
        callBackFn(showrew(values,'Request1'));
      });
    } else if (epoch - 1 != doc[0]['data'][0][0]) {
      db.remove({vote_pub: vote_key}, {});
      Promise.all(getrewards()).then((values) => {
        callBackFn(showrew(values,'Request2'));
      });
    } else {
      callBackFn(showrew(doc[0]['data'],'Cookie'));
    }
    });

}

async function nodeinfo(key, vote_key, RPC_URL) {
  function echotime(secs) {
    let out = [];
    let day = Math.floor(secs / 86400);
    let hour = Math.floor(secs / 3600) - day * 24;
    let minute = Math.floor(secs / 60) - day * 24 * 60 - hour * 60;
    let second = Math.floor(secs % 60);
    out.push(day);
    out.push(hour);
    out.push(minute);
    out.push(second);
    return out;
  }

  const connection = new solanaWeb3.Connection(RPC_URL);
  let timeZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let params_t = 5;
  let data_time = await connection.getRecentPerformanceSamples(params_t);
  let time_t = 0;
  for (let g = 0; g < params_t; g++) {
    let samplePeriodSecs = data_time[g]["samplePeriodSecs"];
    let numSlots = data_time[g]["numSlots"];
    time_t += samplePeriodSecs / numSlots;
  }
  let time_const_d = time_t / params_t;
  const epochInfo = await connection.getEpochInfo();
  const LeaderSchedule = await connection.getLeaderSchedule();
  const production = await connection.getBlockProduction();
  const allt_d = LeaderSchedule[key];
  let sdelal_blokov_d;
  if (production["value"]["byIdentity"][key] === undefined) {
    sdelal_blokov_d = 0;
  } else {
    sdelal_blokov_d = production["value"]["byIdentity"][key][1];
  }

  let cluster_slot_d = epochInfo.slotIndex;
  let end_slot_d = epochInfo.slotsInEpoch;
  let Done, will_done, skipped, skip, all, status;
  let next_slots = [];
  if (allt_d == 0) {
    Done = 0;
    will_done = 0;
    skipped = 0;
    all = 0;
  } else {
    all = allt_d.length;

    for (let i = 0; i < all; i++) {
      if (allt_d[i] >= cluster_slot_d) {
        next_slots.push(allt_d[i]);
      }
    }
    will_done = next_slots.length;
    Done = all - will_done;
    if (Done == 0) {
      skipped = 0;
      skip = 0;
    } else {
      skipped = Done - sdelal_blokov_d;
      skip = Math.round((skipped * 100) / Done, 2);
    }
  }
  const { status_voit } = await getVoteStatus(key, RPC_URL);
  if (status_voit) {
    status = "delinquent 🔴";
  } else {
    status = "current 🟢";
  }
  if (typeof next_slots[0] != undefined && all > Done) {
    let echo = [];
    let techo = [];
    let current_slot = next_slots[0];
    let left_slot = current_slot - cluster_slot_d;
    let secs = left_slot * time_const_d;
    let secs_slot = Date.now() + secs * 1000;
    let normalDate = new Date(secs_slot).toLocaleString("ru-RU", {
      timeZone: timeZ,
    });
    echo = echotime(secs);
    let echo_ = [];
    for (let c = 0; c < will_done; c++) {
      left_slot = next_slots[c] - current_slot;
      let secs1 = left_slot * time_const_d;
      if (secs1 >= 1) {
        echo_.push(echotime(secs1));
        secs_slot += secs1 * 1000;
        techo.push(secs_slot);
      }
      current_slot = next_slots[c];
    }
    let echo_count = echo_.length;
    let last = "";
    for (let d = 0; d < echo_count; d++) {
      last += `${new Date(techo[d]).toLocaleString("ru-RU", {
        timeZone: timeZ,
      })} - ${echo_[d][0]}d ${echo_[d][1]}h ${echo_[d][2]}m ${echo_[d][3]}s\n`;
    }
    let echoe = [];
    let secs_end_epoh = (end_slot_d - cluster_slot_d) * time_const_d;
    echoe = echotime(secs_end_epoh);
    let secs_slot_end = Date.now() + secs_end_epoh * 1000;
    let t_end = new Date(secs_slot_end).toLocaleString("ru-RU", {
      timeZone: timeZ,
    });
    sendmsg = `<code>Status node: ${status} ${await getNode(key, RPC_URL)}\n\nBlock production:\nAll:${all} Done:${Done} Will:${will_done} Skipped:${skipped}\n
Next block:
${normalDate} - ${echo[0]}d ${echo[1]}h ${echo[2]}m ${echo[3]}s
${last}
End epoch:
${t_end} - ${echoe[0]}d ${echoe[1]}h ${echoe[2]}m ${echoe[3]}s</code>`;
    return sendmsg;
  } else {
    let echo = [];
    let secs_end_epoh = (end_slot_d - cluster_slot_d) * time_const_d;
    echo = echotime(secs_end_epoh);
    let secs_slot = Date.now() + secs_end_epoh * 1000;
    let t_end = new Date(secs_slot).toLocaleString("ru-RU", {
      timeZone: timeZ,
    });
   sendmsg = `<code>Status node: ${status} ${await getNode(key, RPC_URL)}\n\nBlock production:\nAll:${all} Done:${Done} Will:${will_done} Skipped:${skipped}\n
All slots Done. End of the epoch:
${t_end} - ${echo[0]}d ${echo[1]}h ${echo[2]}m ${echo[3]}s</code>`;
    return sendmsg;
  }
} //END NODEINFO

bot.on("text", async (msg) => {
  let sendmsg;
  if (msg.from.id == myid) {
    try {
      if (msg.text.startsWith("/start")) {
        let userid = msg.from.id;
        let user = msg.from.first_name;
        let username = msg.from.username;
        let usertype = msg.from.usertype;
        sendmsg = `<code>Hi ${user} your id: ${userid}, username: ${username}, usertype: ${usertype} </code>`;
        bot.sendMessage(msg.chat.id, sendmsg, { parse_mode: "HTML" });
      } else if (msg.text == "/withdraw") {
        await bot.sendMessage(msg.chat.id, `Отправляем 3 sol на identity? yes/no`, {
          reply_markup: {
              inline_keyboard: [
                  [{text: 'Да', callback_data: 'wd_yes'}, {text: 'Нет', callback_data: "closeMenu" }]
              ]
          },
          reply_to_message_id: msg.message_id
        });
      } else if (msg.text == "/balance") {
        sendmsg = await balanceinfo(
          process.env.pubkey_main,
          process.env.pubkey_vote_main,
          process.env.RPC_MAIN
        );
        bot.sendMessage(msg.chat.id, sendmsg, { parse_mode: "HTML" });
      } else if (msg.text == "/stakes") {
        sendmsg = await stakes (
          process.env.pubkey_main,
          process.env.pubkey_vote_main,
          process.env.RPC_MAIN
        );
        bot.sendMessage(msg.chat.id, sendmsg, { parse_mode: "HTML" });
      } else if (msg.text == "/time_main") {
        sendmsg = await nodeinfo(
          process.env.pubkey_main,
          process.env.pubkey_vote_main,
          process.env.RPC_MAIN
        );
        bot.sendMessage(msg.chat.id, sendmsg, { parse_mode: "HTML" });
      } //END TIME
      else if (msg.text == "/time_test") {
        sendmsg = await nodeinfo(
          process.env.pubkey_test,
          process.env.pubkey_vote_test,
          process.env.RPC_TEST
        );
        bot.sendMessage(msg.chat.id, sendmsg, { parse_mode: "HTML" });
      } //END TIME
      else if (msg.text == "/rewards") {
        await rewardinfo(
          process.env.pubkey_main,
          process.env.pubkey_vote_main,
          process.env.RPC_MAIN,
          function (sendmsg){
            bot.sendMessage(msg.chat.id, sendmsg, { parse_mode: "HTML" });
          }
        );
      } //END REWARDS
    } catch (error) {
      console.log(error);
    }
  } else {
    bot.sendMessage(msg.chat.id, "Access denied 403", { parse_mode: "HTML" });
  }
});

//Обрабатываем коллбеки на инлайн-клавиатуре
bot.on('callback_query', async ctx => {
  try {
    switch(ctx.data) {
      case "closeMenu":
          await bot.deleteMessage(ctx.message.chat.id, ctx.message.message_id);
          await bot.deleteMessage(ctx.message.reply_to_message.chat.id, ctx.message.reply_to_message.message_id);
          break;
      case "wd_yes":
        exec(
          '/bin/bash -c "withdrawer.sh"',
          (error, stdout, stderr) => {
            if (error) {
              console.log(`error: ${error.message}`);
              return;
            }
            if (stderr) {
              console.log(`stderr: ${stderr}`);
              return;
            }
            console.log(`stdout: ${stdout}`);
          }
        );
        break;
      }
  }
  catch(error) {
      console.log(error);
  }
})

bot.on("polling_error", (err) => console.log(err.data.error.message));
