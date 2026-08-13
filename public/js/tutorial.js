// Arcade Field Guide — accessible rules for every game.
(function(){'use strict';
const RULES={
'reaction-race':['Wait while the signal is red.','Press the target only when it turns green.','The quickest valid reaction wins; an early press counts against you.'],
'trivia-blitz':['Read the question and all choices.','Choose one answer before time runs out.','Correct answers score more when you answer quickly.'],
'tap-frenzy':['Wait for the round to begin.','Press the large tap target as many times as you can.','Your total taps determine your score.'],
'word-scramble':['Rearrange the shown letters into a word.','Type your answer and submit before the timer ends.','Solve quickly for the strongest score.'],
'emoji-match':['Turn over two cards per turn.','Matching emoji stay revealed; misses turn back over.','Find more pairs than the other players.'],
'simon-says':['Watch the complete colour sequence.','Repeat it in the same order using the four pads.','Each round adds another step; one mistake eliminates you.'],
'math-blitz':['Solve the displayed arithmetic problem.','Enter one answer before time expires.','Speed breaks ties between correct answers.'],
'color-clash':['Read the ink colour, not the colour word.','Choose the button naming the ink colour.','Build a streak with quick, correct choices.'],
'type-racer':['Read the sentence exactly as shown.','Type it into the field; accuracy matters.','Finish accurately and quickly to earn the most points.'],
'color-picker':['Use the red, green, and blue sliders to match the target swatch.','Submit your mix before time expires.','Closer colour matches earn more points.'],
'hangman':['Guess one letter or the whole word on your turn.','Correct letters reveal every matching position.','Solve the word before the drawing is completed.'],
'number-guess':['Enter a number inside the displayed range.','Use the higher or lower hint after each guess.','Find the secret number in the fewest attempts.'],
'geography-quiz':['Read the geography question.','Choose one answer before the timer expires.','Correct, faster answers score more points.']
};
const META={
'reaction-race':['Reaction Race','Patience first, reflexes second.','Tip: keep focus on the target, but do not anticipate the signal.'],
'trivia-blitz':['Trivia Blitz','Choose carefully, then commit.','Tip: every player answers the same question independently.'],
'tap-frenzy':['Tap Frenzy','A short, all-out test of speed.','Tip: keyboard users can use Space or Enter on the tap button.'],
'word-scramble':['Word Scramble','Put a shuffled word back in order.','Tip: spelling must match the answer.'],
'emoji-match':['Emoji Match','A shared memory board where pairs score.','Tip: remember misses—they are clues for your next turn.'],
'simon-says':['Simon Says','Watch, remember, repeat.','Tip: wait until the sequence finishes before pressing a pad.'],
'math-blitz':['Math Blitz','Fast arithmetic with accuracy first.','Tip: check the operator before submitting.'],
'color-clash':['Color Clash','A Stroop test: trust the ink, not the word.','Tip: say the ink colour to yourself before choosing.'],
'type-racer':['Type Racer','An accuracy race across one sentence.','Tip: correcting a typo is faster than submitting an inaccurate line.'],
'color-picker':['Color Picker','Mix RGB light to match a target.','Tip: compare which channel needs to become lighter or darker.'],
'hangman':['Hangman','Reveal the hidden word before guesses run out.','Tip: common vowels are useful early guesses.'],
'number-guess':['Number Guess','Narrow a hidden range with each clue.','Tip: choose the midpoint to eliminate the most possibilities.'],
'geography-quiz':['Geography Quiz','Places, capitals, flags, and landmarks.','Tip: answer only after reading every choice.']};
let overlay=null,returnFocus=null,onComplete=null;
function close(complete=true){if(!overlay)return;overlay.remove();overlay=null;document.removeEventListener('keydown',onKey);if(returnFocus?.isConnected)returnFocus.focus();const cb=onComplete;onComplete=null;if(complete&&cb)cb();}
function onKey(e){if(e.key==='Escape')close();if(e.key==='Tab'&&overlay){const f=[...overlay.querySelectorAll('button')];if(!f.length)return;if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus()}}}
function show(container,id,complete){close(false);const m=META[id]||[id,'Learn the field before play begins.',''];returnFocus=document.activeElement;onComplete=complete||null;overlay=document.createElement('div');overlay.className='tutorial-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','tutorial-title');const card=document.createElement('div');card.className='tutorial-card';const kicker=document.createElement('p');kicker.className='tutorial-kicker';kicker.textContent='Field guide · How to play';const title=document.createElement('h2');title.id='tutorial-title';title.textContent=m[0];const summary=document.createElement('p');summary.className='tutorial-summary';summary.textContent=m[1];const list=document.createElement('ol');list.className='tutorial-rules';(RULES[id]||['Follow the instructions shown during play.']).forEach(text=>{const li=document.createElement('li');li.textContent=text;list.append(li)});const tip=document.createElement('p');tip.className='tutorial-tip';tip.textContent=m[2];const actions=document.createElement('div');actions.className='tutorial-actions';const button=document.createElement('button');button.className='btn btn-primary tutorial-close';button.textContent=complete?'Ready — start game':'Back to game';button.addEventListener('click',()=>close());actions.append(button);card.append(kicker,title,summary,list,tip,actions);overlay.append(card);document.body.append(overlay);document.addEventListener('keydown',onKey);button.focus()}
window.GameRules=RULES;
window.TutorialEngine={run(container,client,gameName,socket,state,players,complete){show(container,state.currentGame,complete)},show(container,id){show(container,id,null)},skip(){close()},destroy(){close(false)}};
})();
