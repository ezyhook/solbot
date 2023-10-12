const solanaWeb3 = require("@solana/web3.js");
const { PublicKey, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction, Keypair } = require("@solana/web3.js");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const Datastore = require('nedb');
const { Cron } = require("croner");

const timeZ = "Europe/Moscow";
const dbfile='cookie.json'
let db = new Datastore({filename : dbfile, autoload: true, timestampData: true});
const bot = new TelegramBot(process.env.API_KEY_BOT, {
  polling: true,
});

const commands = [
  { command: "start", description: "Start bot" },
  { command: "menu", description: "Bot menu" },
  { command: "withdraw", description: "Снять на голосование 3 SOL" },
  { command: "autowithdraw", description: "Autowithdraw 0.771 sol." },
  { command: "withdraw_vo_to", description: "Отправить SOL с vote" },
  { command: "withdraw_id_to", description: "Отправить SOL с identity" },
  { command: "balance", description: "Show balance" },
  { command: "rewards", description: "Show rewards for 10 epoch" },
  { command: "stakes", description: "Show stakes" },
  { command: "stakes_va", description: "Show another stakes" },
  { command: "time_main", description: "Mainnet block production" },
  { command: "time_test", description: "Testnet block production" },
];

bot.setMyCommands(commands);

//Функция округления
Math.round1 = function (num, decimalPlaces = 0) {
  var p = Math.pow(10, decimalPlaces);
    var n = (num * p) * (1 + Number.EPSILON);
    return Math.round(n) / p;
};
//Функция разделения сообщения
function chunkString(str, size, delimiter='\n' ) {
  let result = [];
  // result.push(str.slice(4076, 8135));
  let t = 0;
  let str_index;
  for (let i = 0; i < str.length/size; i++) {
    str_index = str.slice(t, t+size).lastIndexOf(delimiter);
    result.push(str.slice(t, t+str_index));
    t += str_index + delimiter.length;
  }
  return result;
}
//Функция инфо по ноде
async function getNode(identityPublicKey, RPC_URL) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  const nodes = await connection.getClusterNodes();
  try {
    for (const mynode of nodes) {
      if (mynode.pubkey === identityPublicKey) {
        return `v${mynode.version}\nGossip: ${mynode.gossip}`;
      }
    }
  }
    catch(error) { 
      return `🔴 Node ${mynode.pubkey} undefined.`;
  }
}

//Функция провеки публичного ключа
async function checkkey(key1){
    try {
      const key = new solanaWeb3.PublicKey(key1);
      if (await solanaWeb3.PublicKey.isOnCurve(key) == true) {
        return true;
      } else {
      return false;
      }
    } 
    catch(error) {
      return false;
    }
}

//Функция выполение транзакции с identity в сторонний кошелек
async function WithdrawFromIdentity([key_prkey1, RPC_URL], receiver3_1, sol){
  const connection = new solanaWeb3.Connection(RPC_URL);

  const stringToArray3 = key_prkey1.replace('[', '').replace(']', '').split(',');
  const prkey_key = Uint8Array.from(stringToArray3);

  const sender = Keypair.fromSecretKey(prkey_key);
  const receiver3 = new PublicKey(receiver3_1);
  const senderbalance = await connection.getBalance(sender.publicKey);
  const senderbalanceLimit = 2;
  const amoLimit = senderbalance - senderbalanceLimit*LAMPORTS_PER_SOL;
  const amount = sol*LAMPORTS_PER_SOL;
  if ( amount > amoLimit) {
    return `<code>🔴 Withdraw will leave identity with insufficient funds. ${amoLimit} SOL need for paying voting.\nYou can send max: ${amoLimit/LAMPORTS_PER_SOL} SOL.\nTransaction stoped.</code>`;
  } else {
  const transferTransaction = new Transaction().add(
    solanaWeb3.SystemProgram.transfer({
      fromPubkey: sender.publicKey,
      toPubkey: receiver3,
      lamports: amount,
    })
  );
  
  const signature = await sendAndConfirmTransaction(connection, transferTransaction, [sender]);

  return `<code>🟢 You sent ${sol} SOL to ${receiver3_1}.\n\nTransaction signature: ${signature}</code>`;
  }
}

//Функция выполение транзакции по снятию с vote account
async function WithdrawFromVote([key_prkey1, vote_key1, prkey_authoriz, RPC_URL], receiver2_1, sol) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  const vote_key = new PublicKey(vote_key1);

  const stringToArray2 = prkey_authoriz.replace('[', '').replace(']', '').split(',');
  const prkey_auth = Uint8Array.from(stringToArray2);
  const stringToArray3 = key_prkey1.replace('[', '').replace(']', '').split(',');
  const prkey_key = Uint8Array.from(stringToArray3);  
  const auth = Keypair.fromSecretKey(prkey_auth);
  const receiver = Keypair.fromSecretKey(prkey_key);
  const votebalance = await connection.getBalance(vote_key);
  const votebalanceLimit = 2; 
  const amount = sol*LAMPORTS_PER_SOL;
  
  if (receiver2_1 == null) {
    params = {
      authorizedWithdrawerPubkey: auth.publicKey,
      lamports: amount,
      toPubkey: receiver.publicKey,
      votePubkey: vote_key,
    };
  } else {
    const receiver2 = new PublicKey(receiver2_1);
    params = {
      authorizedWithdrawerPubkey: auth.publicKey,
      lamports: amount,
      toPubkey: receiver2,
      votePubkey: vote_key,
    };
  }
  try {
  const transaction = new Transaction().add(
    solanaWeb3.VoteProgram.safeWithdraw(params, votebalance, votebalanceLimit*LAMPORTS_PER_SOL)
  );
  let blockhash = await connection
  .getLatestBlockhash()
  .then((res) => res.blockhash);

  transaction.feePayer = receiver.publicKey;
  transaction.recentBlockhash =  blockhash;

  const signature = await connection.sendTransaction(transaction, [receiver, auth]);

  return `<code>🟢 Withdrawed ${sol} SOL to ${params.toPubkey}.\n\nTransaction signature: ${signature}</code>`;
  }
  catch(error) {
    return `<code>🔴 Withdraw will leave vote account with insufficient funds. ${votebalanceLimit} SOL need for paying rent.\nYou can withdraw max: ${(votebalance - votebalanceLimit*LAMPORTS_PER_SOL)/LAMPORTS_PER_SOL} SOL.\nTransaction stoped.</code>`;
  }
}

//Функция определения статуса валидатора
async function getVoteStatus(identityPublicKey, RPC_URL) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  const voteAccounts = await connection.getVoteAccounts();
  try {
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
  }
  catch(error) {
    return `🔴 Vote Account ${identityPublicKey} undefined.`;
  }
}
//Функция сортировки объекта
function sortArrayOfObjects(arrayToSort, key) {
  function compareObjects(a, b) {
      if (a[key] > b[key])
          return -1;
      if (a[key] < b[key])
          return 1;
      return 0;
  }

  return arrayToSort.sort(compareObjects);
}
//Функция определения делегированых на валидатора стэйков
let arrmes2 =[];
async function stakes([key, vote_key, RPC_URL]) {
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
    let arrmes=[];
    for (let i=0; i < accounts.length; i++) {
      let out = [];
      staker = accounts[i]["account"]["data"]["parsed"]["info"]["meta"]["authorized"]["staker"];
      a_epoch = accounts[i]["account"]["data"]["parsed"]["info"]["stake"]["delegation"]["activationEpoch"];
      d_epoch = accounts[i]["account"]["data"]["parsed"]["info"]["stake"]["delegation"]["deactivationEpoch"];
      if (d_epoch == 18446744073709551615) {d_epoch = '∞';}
      stake = accounts[i]["account"]["data"]["parsed"]["info"]["stake"]["delegation"]["stake"] / LAMPORTS_PER_SOL;
      echo_stake = Math.round1(stake, 4);
      sum += stake;
      out.push(staker, a_epoch, d_epoch, echo_stake);
      arrmes.push(out);
    }
    
    let stake1;
    let activ=0;
    let deactiv=0;
    arrmes2 = sortArrayOfObjects(arrmes, 1);
    for (let g=0; g < accounts.length; g++) {
      st1 = arrmes2[g][0].slice(0,3);
      st2 = arrmes2[g][0].slice(-4);
      if (arrmes2[g][2] !== '∞') {
        stake1 = `-${arrmes2[g][3].toFixed(4)}🔴`;
        deactiv += arrmes2[g][3];
      } else if (arrmes2[g][1] == epochInfo.epoch && arrmes2[g][2] == '∞') {
        stake1 = `+${arrmes2[g][3].toFixed(4)}🟢`;
        activ += arrmes2[g][3];
      } else {
        stake1 = arrmes2[g][3].toFixed(4);
      }
      mes += `${g+1}. ${st1}..${st2}  ${arrmes2[g][1]} - ${arrmes2[g][2]}  ${stake1}\n`;
    }
    sendmsg = `CurrentEpoch: ${epochInfo.epoch}\n    Staker  StartEp EndEp  Stake\n${mes}\nActiv: +${Math.round1(activ, 2).toFixed(2)} / Deactiv: -${Math.round1(deactiv, 2).toFixed(2)}\n\nTotal: ${Math.round1(sum, 2).toFixed(2)} sol\n`;
    return sendmsg;
  }
}
//Функция по определению балансов валидатора
async function balanceinfo([key, vote_key, RPC_URL]) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  const walletKey1 = new solanaWeb3.PublicKey(key);
  const walletKey2 = new solanaWeb3.PublicKey(vote_key);
  const balance1 = await connection.getBalance(walletKey1);
  const balance2 = await connection.getBalance(walletKey2);
  const solBalance1 = Math.round1(balance1 / LAMPORTS_PER_SOL, 4);
  const solBalance2 = Math.round1(balance2 / LAMPORTS_PER_SOL, 4);
  const { custake } = await getVoteStatus(key, RPC_URL);
  return [ solBalance1, solBalance2, custake ];
}
//Функция по определению наград полученных валидатором на vote account
async function rewardinfo([key, vote_key, RPC_URL], callBackFn) {
  const connection = new solanaWeb3.Connection(RPC_URL);
  let vote_key1 = new solanaWeb3.PublicKey(vote_key);
  const epochInfo = await connection.getEpochInfo();
  const epoch = epochInfo.epoch;

  function showrew(values, stat) {
    let sum_rew = 0;
    let sendmsg = `<code>${stat}\nEpoch Comm   Rewards Balance\n`;
    for (let g = 0; g < 10; g++) {
      sendmsg += `${values[g][0]}     ${values[g][1]}      ${Math.round1(values[g][2] / LAMPORTS_PER_SOL, 2)}   ${Math.round1(values[g][3] / LAMPORTS_PER_SOL, 2)}\n`;
      sum_rew += values[g][2] / LAMPORTS_PER_SOL;
    }
    sendmsg += `\n Sum rewards:  ${Math.round1(sum_rew, 2).toFixed(2)} sol</code>`;
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
//Функция для определению производительности ноды
async function nodeinfo([key, vote_key, RPC_URL]) {
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
  if (typeof production["value"]["byIdentity"][key] === 'undefined') {
    sdelal_blokov_d = 0;
  } else {
    sdelal_blokov_d = production["value"]["byIdentity"][key][1];
  }

  let cluster_slot_d = epochInfo.slotIndex;
  let end_slot_d = epochInfo.slotsInEpoch;
  let Done, will_done, skipped, skip, all, status;
  let next_slots = [];
  if (typeof allt_d === "undefined") {
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
      skip = Math.round1((skipped * 100) / Done, 2);
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
    sendmsg = `Status node: ${status} ${await getNode(key, RPC_URL)}\n\nBlock production:\nAll:${all} Done:${Done} Will:${will_done} Skipped:${skipped}\n
Next block:
${normalDate} - ${echo[0]}d ${echo[1]}h ${echo[2]}m ${echo[3]}s
${last}
End epoch:
${t_end} - ${echoe[0]}d ${echoe[1]}h ${echoe[2]}m ${echoe[3]}s\n`;
    return sendmsg;
  } else {
    let echo = [];
    let secs_end_epoh = (end_slot_d - cluster_slot_d) * time_const_d;
    echo = echotime(secs_end_epoh);
    let secs_slot = Date.now() + secs_end_epoh * 1000;
    let t_end = new Date(secs_slot).toLocaleString("ru-RU", {
      timeZone: timeZ,
    });
   sendmsg = `Status node: ${status} ${await getNode(key, RPC_URL)}\n\nBlock production:\nAll:${all} Done:${Done} Will:${will_done} Skipped:${skipped}\n
All slots Done. End of the epoch:
${t_end} - ${echo[0]}d ${echo[1]}h ${echo[2]}m ${echo[3]}s\n`;
    return sendmsg;
  }
} //END NODEINFO

  /* Основные параметры */
  const clusterParams = {
    test: [process.env.pubkey_test, process.env.pubkey_vote_test, process.env.RPC_TEST],
    main: [process.env.pubkey_main, process.env.pubkey_vote_main, process.env.RPC_MAIN],
    withdraw_test: [process.env.prkey_ident_test, process.env.pubkey_vote_test, process.env.prkey_authoriz_test, process.env.RPC_TEST],
    withdraw_main: [process.env.prkey_ident_main, process.env.pubkey_vote_main, process.env.prkey_authoriz_main, process.env.RPC_MAIN],
    send_test: [process.env.prkey_ident_test, process.env.RPC_TEST],
    send_main: [process.env.prkey_ident_main, process.env.RPC_MAIN]
  }

  /*------Определение параметров ---------------*/
  let current_params, withdraw_params;
  if (process.env.cluster == 'main') {
    current_params = clusterParams.main;
    withdraw_params = clusterParams.withdraw_main;
    send_params = clusterParams.send_main;
  } else {
    current_params = clusterParams.test;
    withdraw_params = clusterParams.withdraw_test;
    send_params = clusterParams.send_test;
  }
  /*--------------------------------------------*/



// Автоснятие для голосования
  var task = Cron('0 5 12 * * *', {timezone: timeZ, paused: true}, async () =>  {
    sendmsg = await WithdrawFromVote(
      withdraw_params,
      null,
      process.env.autowithdraw
      );
    await bot.sendMessage(myid, `Auto: ${sendmsg}`, { parse_mode: "HTML" });
  });

//Обработка текстовых сообщений ботом
bot.on("text", async (msg) => {
  let sendmsg, sendmsg1;
  if (msg.from.id == myid) {
    try {
      if (msg.text == "/start" || msg.text == "Старт") {
        sendmsg = `<code>Hi ${msg.from.first_name} your id: ${msg.from.id}, chat id ${msg.chat.id}, username: ${msg.from.username}\nCurrent cluster:${process.env.cluster}.\nEnter to menu</code> /menu`;
        bot.sendMessage(msg.chat.id, sendmsg, { parse_mode: "HTML" });
      } else if(msg.text == '/menu' || msg.text == "Меню") {
        await bot.sendMessage(msg.chat.id, 'Menu is open -->', {
            reply_markup: {
                keyboard: [
                    ['Старт', 'Баланс'],
                    ['Снять на голосование 3 sol'],
                    ['Отправить с identity', 'Снять из vote на identity'],
                    ['Стэйки', 'Реварды'],
                    ['Валидатор тест', 'Валидатор майн'],
                    ['❌ Закрыть меню']
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
      } else if(msg.text == '❌ Закрыть меню') {
          await bot.sendMessage(msg.chat.id, '--> Menu is closed', {
              reply_markup: {
                  remove_keyboard: true
              }
        });
      } else if (msg.text == "/withdraw" || msg.text == "Снять на голосование 3 sol") {
        await bot.sendMessage(msg.chat.id, `Снимаем на голосование 3 SOL?\nFeepayer -> identity.\nYes/No`, {
          reply_markup: {
              inline_keyboard: [
                  [{text: 'Yes', callback_data: 'wd_for_vote'}, {text: 'No', callback_data: "closeMenu" }]
              ]
          },
          reply_to_message_id: msg.message_id
        });
      } else if (msg.text == "/autowithdraw") {
        let tasks = task.isRunning() ? "Activ 🟢" : "Deactiv 🔴";
        await bot.sendMessage(msg.chat.id, `Autowithdraw ${process.env.autowithdraw} sol.\nStatus: ${tasks}\nNext withdraw: ${task.nextRuns(3)}`, {
          reply_markup: {
              inline_keyboard: [
                  [{text: 'Запустить', callback_data: 'task_on'}, {text: 'Остановить', callback_data: "task_off" }]
              ]
          },
          reply_to_message_id: msg.message_id
        });
      } else if (msg.text == "/withdraw_vo_to" || msg.text == "Снять из vote на identity") {
        await bot.sendMessage(msg.chat.id, `Снимем SOL c vote account?\nFeepayer -> identity.\nYes/No`, {
          reply_markup: {
              inline_keyboard: [
                  [{text: 'Yes', callback_data: 'wd_to'}, {text: 'No', callback_data: "closeMenu" }]
              ]
          },
          reply_to_message_id: msg.message_id
        });
      } else if (msg.text == "/withdraw_id_to" || msg.text == "Отправить с identity") {
        await bot.sendMessage(msg.chat.id, `Отправить SOL c identity?\nFeepayer -> identity.\nYes / No`, {
          reply_markup: {
              inline_keyboard: [
                  [{text: 'Yes', callback_data: 'id_to'}, {text: 'No', callback_data: "closeMenu" }]
              ]
          },
          reply_to_message_id: msg.message_id
        });
      } else if (msg.text == "/balance" || msg.text == "Баланс") {
        balances = await balanceinfo(
          current_params
          );
        if (balances[0] < 3) {
          sendmsg = `<code>Пополни баланс identity 🔴\nIdentity balance: ${balances[0]} sol\nVote account balance: ${balances[1]} sol\nActivatedStake: ${Math.round1(
            balances[2] / LAMPORTS_PER_SOL,
            4
          )} sol</code>`
          bot.sendMessage(msg.chat.id, sendmsg, { parse_mode: "HTML", reply_markup: {
            inline_keyboard: [
                [{text: 'Отправить 3 SOL на identity', callback_data: 'wd_for_vote'}, {text: 'Нет', callback_data: "closeMenu" }]
            ]
          },
          reply_to_message_id: msg.message_id
          });
        } else {
          sendmsg = `<code>Identity balance: ${balances[0]} sol\nVote account balance: ${balances[1]} sol\nActivatedStake: ${Math.round1(
            balances[2] / LAMPORTS_PER_SOL,
            4
          ).toFixed(4)} sol</code>`
          bot.sendMessage(msg.chat.id, sendmsg, { parse_mode: "HTML" });
        }
      } else if (msg.text == "/stakes" || msg.text == "Стэйки") {
        sendmsg1 = await stakes (
          current_params
          );
        sendmsg = chunkString (sendmsg1, 4080);
        for (let i=0; i < sendmsg.length; i++) {
          await bot.sendMessage(msg.chat.id, `<code>${sendmsg[i]}</code>`, { parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
                [{text: 'Группировать по стэйкеру', callback_data: 'group_stakes'}]
            ]
        },
        reply_to_message_id: msg.message_id
       });
        }
      } else if (msg.text == "/stakes_va") {
        bot.sendMessage(msg.chat.id, '<code>Введите pubkey vote account:("stop" for exit)</code>', { parse_mode: "HTML" });
        bot.once("text", async (addr_va) => {
          if (addr_va.text == "stop") {
            bot.sendMessage(addr_va.chat.id, 'Stoped.', { parse_mode: "HTML" });
          } else {
            const va = addr_va.text.replace(/[^a-zA-Z0-9]/g, '');
            if (await checkkey(va)) {
              let sendmsg1 = await stakes (
                ['none', va, current_params[2]]
                );
              sendmsg = chunkString (sendmsg1, 4080);
              for (let i=0; i < sendmsg.length; i++) {
                await bot.sendMessage(addr_va.chat.id, `<code>${sendmsg[i]}</code>`, { parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                      [{text: 'Группировать по стэйкеру', callback_data: 'group_stakes'}]
                  ]
              },
              reply_to_message_id: msg.message_id });
              }
            } else {
              bot.sendMessage(addr_va.chat.id, `<code>🔴 Voit account ${va} is not vailed.</code>`, { parse_mode: "HTML" });
            }
          }
        })
      } else if (msg.text == "/time_main" || msg.text == "Валидатор майн") {
        sendmsg1 = await nodeinfo(
          current_params
        );
        sendmsg = chunkString (sendmsg1, 4080);
        for (let i=0; i < sendmsg.length; i++) {
          await bot.sendMessage(msg.chat.id, `<code>${sendmsg[i]}</code>`, { parse_mode: "HTML" });
        }
      } //END TIME
      else if (msg.text == "/time_test" || msg.text == "Валидатор тест") {
        sendmsg1 = await nodeinfo(
            clusterParams.test
        );
        sendmsg = chunkString (sendmsg1, 4080);
        for (let i=0; i < sendmsg.length; i++) {
          await bot.sendMessage(msg.chat.id, `<code>${sendmsg[i]}</code>`, { parse_mode: "HTML" });
        }
      } //END TIME
      else if (msg.text == "/rewards" || msg.text == "Реварды") {
        await rewardinfo(
          current_params,
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

//Обработка колбэков бота
bot.on('callback_query', async ctx => {
  let tasks;
  try {
    switch(ctx.data) {
      case "closeMenu":
        await bot.deleteMessage(ctx.message.chat.id, ctx.message.message_id);
        await bot.deleteMessage(ctx.message.reply_to_message.chat.id, ctx.message.reply_to_message.message_id);
        break;

      case "wd_for_vote":
        await bot.deleteMessage(ctx.message.chat.id, ctx.message.message_id);
        await bot.deleteMessage(ctx.message.reply_to_message.chat.id, ctx.message.reply_to_message.message_id);
        sendmsg = await WithdrawFromVote(
          withdraw_params,
          null,
          3
          );
        await bot.sendMessage(ctx.message.chat.id, sendmsg, { parse_mode: "HTML" });
      break;

      case "wd_to":
        await bot.deleteMessage(ctx.message.chat.id, ctx.message.message_id);
        await bot.deleteMessage(ctx.message.reply_to_message.chat.id, ctx.message.reply_to_message.message_id);
        bot.sendMessage(ctx.message.chat.id, '<code>Введите адрес принимающего кошелька:("stop" for exit)</code>', { parse_mode: "HTML" });
        bot.once("text", async (addr) => {
          if (addr.text == "stop") {
            bot.sendMessage(addr.chat.id, 'Transaction stoped.', { parse_mode: "HTML" });
          } else {
            const receiver21 = addr.text.replace(/[^a-zA-Z0-9]/g, '');
            if (await checkkey(receiver21)) {
              bot.sendMessage(addr.chat.id, '<code>Введите сумму для отправки SOL:("stop" for exit)</code>', { parse_mode: "HTML" });
              bot.once("text", async (amount_sol) => {
                let sol = parseFloat(amount_sol.text.replace(/[^\d.]/g, ''));
                if (amount_sol.text == "stop") {
                  bot.sendMessage(amount_sol.chat.id, 'Transaction stoped.', { parse_mode: "HTML" });
                } else if (isNaN(sol)) {
                  bot.sendMessage(amount_sol.chat.id, `<code>🔴 Amount "${amount_sol.text}" is not correct.</code>`, { parse_mode: "HTML" });
                } else {
                  sendmsg = await WithdrawFromVote(
                    withdraw_params,
                    receiver21,
                    sol
                  );
                  await bot.sendMessage(amount_sol.chat.id, sendmsg, { parse_mode: "HTML" });
                  }
                });
              } else {
                bot.sendMessage(addr.chat.id, `<code>🔴 Wallet ${receiver21} is not vailed.</code>`, { parse_mode: "HTML" });
              }
          }
        });
        break;

        case "id_to":
          await bot.deleteMessage(ctx.message.chat.id, ctx.message.message_id);
          await bot.deleteMessage(ctx.message.reply_to_message.chat.id, ctx.message.reply_to_message.message_id);
          bot.sendMessage(ctx.message.chat.id, '<code>Введите адрес принимающего кошелька:("stop" for exit)</code>', { parse_mode: "HTML" });
          bot.once("text", async (addr) => {
            if (addr.text == "stop") {
              bot.sendMessage(addr.chat.id, 'Transaction stoped.', { parse_mode: "HTML" });
            } else {
              const receiver31 = addr.text.replace(/[^a-zA-Z0-9]/g, '');
              if (await checkkey(receiver31)) {
                bot.sendMessage(addr.chat.id, '<code>Введите сумму для отправки SOL:("stop" for exit)</code>', { parse_mode: "HTML" });
                bot.once("text", async (amount_sol) => {
                  let sol = parseFloat(amount_sol.text.replace(/[^\d.]/g, ''));
                  if (amount_sol.text == "stop") {
                    bot.sendMessage(amount_sol.chat.id, 'Transaction stoped.', { parse_mode: "HTML" });
                  } else if (isNaN(sol)) {
                    bot.sendMessage(amount_sol.chat.id, `<code>🔴 Amount "${amount_sol.text}" is not correct.</code>`, { parse_mode: "HTML" });
                  } else {
                    sendmsg = await WithdrawFromIdentity(
                      send_params,
                      receiver31,
                      sol
                    );
                    await bot.sendMessage(amount_sol.chat.id, sendmsg, { parse_mode: "HTML" });
                    }
                  });
                } else {
                  bot.sendMessage(addr.chat.id, `<code>🔴 Wallet ${receiver31} is not vailed.</code>`, { parse_mode: "HTML" });
                }
            }
          });
          break;
        case "group_stakes":
          const connection = new solanaWeb3.Connection(current_params[2]);
          const epochInfo = await connection.getEpochInfo();
          let arr_stake = [];
          arrmes2.forEach((arr, index) => {
            let tmp_obj = {};
            tmp_obj['pub_staker'] = arr[0];
            tmp_obj['start_epoch'] = arr[1];
            tmp_obj['end_epoch'] = arr[2];
            tmp_obj['stake'] = arr[3];
            arr_stake.push(tmp_obj);
          });
          const groupBy = (x,f)=>x.reduce((a,b,i)=>((a[f(b,i,x)]||=[]).push(b),a),{});
          let group_arr_stake = groupBy(arr_stake, v => v.pub_staker);
          let newmes = [];
          for (const [ key, values] of Object.entries(group_arr_stake)) {

              const total = values.reduce(
                function (sum, currentStake) {
                  return sum + currentStake.stake;
                }, 0);

                let totalDeactive = 0
                let deactiv;
                for (let i = 0; i < values.length; i++) {
                  const currentAccount1 = values[i];
                  if (currentAccount1.end_epoch !== '∞') {
                    totalDeactive += currentAccount1.stake
                  } 
                }
                if (typeof totalDeactive == "undefined") { deactiv = 0; } else { deactiv = totalDeactive; }


                let totalActive = 0
                let activ;
                for (let i = 0; i < values.length; i++) {
                  const currentAccount = values[i];
                  if (currentAccount.start_epoch == epochInfo.epoch && currentAccount.end_epoch == '∞') {
                    totalActive += currentAccount.stake
                  } 
                }
                if (typeof totalActive == "undefined") { activ = 0; } else { activ = totalActive; }
                newmes.push([key,total,deactiv,activ])
          }
        let newmesM = sortArrayOfObjects(newmes, 1);
        let newmesS = '';
        for (let i=0; i < newmesM.length; i++) {
          st1 = newmesM[i][0].slice(0,3);
          st2 = newmesM[i][0].slice(-4);
          newmesS += `${i+1}. ${st1}..${st2} ${Math.round1(newmesM[i][1], 2).toFixed(2)} -${Math.round1(newmesM[i][2], 2).toFixed(2)} +${Math.round1(newmesM[i][3], 2).toFixed(2)}\n`;
        }
        sendmsg = chunkString(newmesS, 4000);
        for (let i=0; i < sendmsg.length; i++) {
          await bot.sendMessage(ctx.message.chat.id, `<code>   Staker    Stake  Deactiv  Activ \n${sendmsg[i]}</code>`, { parse_mode: "HTML" });
        }
        break;
      case "task_on":
        task.resume();
        await bot.deleteMessage(ctx.message.chat.id, ctx.message.message_id);
        await bot.deleteMessage(ctx.message.reply_to_message.chat.id, ctx.message.reply_to_message.message_id);
        tasks = task.isRunning() ? "Activ 🟢" : "Deactiv 🔴";
        await bot.sendMessage(ctx.message.chat.id, `Autowithdraw ${process.env.autowithdraw} sol.\nStatus: ${tasks}\nNext withdraw: ${task.nextRun()}`, { parse_mode: "HTML" });
        break;
      case "task_off":
        task.pause();
        await bot.deleteMessage(ctx.message.chat.id, ctx.message.message_id);
        await bot.deleteMessage(ctx.message.reply_to_message.chat.id, ctx.message.reply_to_message.message_id);
        tasks = task.isRunning() ? "Activ 🟢" : "Deactiv 🔴";
        await bot.sendMessage(ctx.message.chat.id, `Autowithdraw ${process.env.autowithdraw} sol.\nStatus: ${tasks}`, { parse_mode: "HTML" });
        break;
      }
  }
  catch(error) {
      console.log(error);
  }
})

bot.on("polling_error", (err) => console.log(err.code));
