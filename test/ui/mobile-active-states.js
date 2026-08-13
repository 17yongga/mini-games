const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const baseUrl = process.env.MINIGAMES_BASE_URL || 'http://127.0.0.1:3015';
const viewports = [
  { name: 'iphone-se', width: 320, height: 568 },
  { name: 'compact-android', width: 360, height: 640 },
  { name: 'iphone-8', width: 375, height: 667 },
  { name: 'modern-iphone', width: 390, height: 844 },
  { name: 'keyboard-open', width: 375, height: 400 },
  { name: 'landscape', width: 667, height: 375 }
];
const games = {
  hangman: { phase:'round_start',round:1,totalRounds:5,hint:'Technology',timeLimit:30,maxWrong:6,blanks:Array(12).fill('_') },
  'word-scramble': { phase:'scrambled',scrambled:'KNOWLEDGEABLE',wordLength:13,timeLimit:20 },
  'type-racer': { phase:'typing',roundId:1,round:1,totalRounds:5,sentence:'Pack my box with five dozen liquor jugs while quick racers type accurately.',timeLimit:30000 },
  'math-blitz': { phase:'solving',round:1,totalRounds:10,problem:'128 × 47 = ?',timeLimit:10000,level:3 },
  'number-guess': { phase:'guessing',round:1,totalRounds:5,range:{min:1,max:500},timeLimit:30000 },
  'emoji-match': { phase:'playing',boardSize:20,cols:5,currentTurn:'p1',currentTurnName:'A very long mobile player name' },
  'simon-says': { phase:'input',sequenceLength:8,survivors:4,totalPlayers:4 },
  'reaction-race': { phase:'go',roundId:1,round:1,totalRounds:5 },
  'tap-frenzy': { phase:'tapping',roundId:1,duration:10000 },
  'trivia-blitz': { phase:'question',question:'Which scientific principle explains why extremely long answer text can remain visible on a compact mobile interface?',options:['Conservation of angular momentum','The uncertainty principle','General theory of relativity','Electromagnetic induction'],timeLimit:15 },
  'geography-quiz': { phase:'question',round:10,totalRounds:10,question:'Which sovereign country possesses the longest continuous coastline anywhere in the world?',options:['The Russian Federation','The Republic of Indonesia','Canada','The Kingdom of Norway'],timeLimit:15 },
  'color-clash': { phase:'question',round:1,totalRounds:10,word:'PURPLE',inkColor:'orange',options:['red','blue','green','orange'],timeLimit:5000 },
  'color-picker': { phase:'picking',round:1,totalRounds:8,target:{r:214,g:73,b:52},timeLimit:15000 }
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  let checks = 0;
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport, isMobile:true, hasTouch:true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(baseUrl, { waitUntil:'networkidle' });
      for (const [id, state] of Object.entries(games)) {
        if (!await page.evaluate(gameId => Boolean(window.GameClients?.[gameId]), id)) {
          await page.addScriptTag({ url:`${baseUrl}/js/games/${id}.js` });
        }
        await page.evaluate(({ id, state }) => {
          document.querySelectorAll('.screen').forEach(screen => { screen.hidden=true; screen.classList.remove('active'); });
          const screen = document.querySelector('#screen-game');
          screen.hidden=false; screen.classList.add('active');
          document.querySelector('#game-title').textContent=id;
          const container=document.querySelector('#game-container');
          container.replaceChildren();
          const client=window.GameClients[id];
          try { client.destroy?.(); client.cleanup?.(); } catch {}
          client.init(container,{ emit(){} },{ myId:'p1',playerId:'p1' },[]);
          client.onState(state);
          scrollTo(0,0);
        }, { id, state });
        const metrics = await page.evaluate(() => {
          const container=document.querySelector('#game-container');
          const cr=container.getBoundingClientRect();
          const visible=[container,...container.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0});
          const overflow=visible.filter(el=>{const r=el.getBoundingClientRect();return r.left<cr.left-1||r.right>cr.right+1}).map(el=>`${el.tagName}.${typeof el.className==='string'?el.className:''}`);
          const small=visible.filter(el=>el.matches('button,input[type=range],[role=button]')).filter(el=>{const r=el.getBoundingClientRect();return r.width<44||r.height<44}).map(el=>`${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
          const connection=document.querySelector('#connection-status');
          const semanticEmoji=[...container.querySelectorAll('.emoji-cell')].every(el=>el.tagName==='BUTTON');
          return { overflow, small, semanticEmoji, containerOverflow:container.scrollWidth>container.clientWidth+1, connectionFixed:getComputedStyle(connection).position==='fixed' };
        });
        assert.deepEqual(metrics.overflow,[],`${viewport.name}/${id}: elements escape game canvas: ${metrics.overflow}`);
        assert.equal(metrics.containerOverflow,false,`${viewport.name}/${id}: horizontal canvas overflow`);
        if (viewport.width <= 520) assert.equal(metrics.connectionFixed,false,`${viewport.name}/${id}: connection badge must not overlay gameplay`);
        if (id === 'emoji-match') assert.equal(metrics.semanticEmoji,true,`${viewport.name}: emoji cards must be semantic buttons`);
        assert.deepEqual(metrics.small,[],`${viewport.name}/${id}: undersized targets: ${metrics.small}`);
        checks += 4;
      }
      assert.deepEqual(errors,[],`${viewport.name}: browser errors: ${errors}`);
      await page.close();
    }
  } finally { await browser.close(); }
  console.log(`Active-state mobile checks passed: ${Object.keys(games).length} games × ${viewports.length} viewports, ${checks} assertions.`);
})().catch(error=>{ console.error(error); process.exit(1); });
