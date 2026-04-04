// Trivia Blitz — fast multiple-choice questions, points for speed + correctness

const QUESTIONS = [
  // Science & Nature
  { q: 'What planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], answer: 1 },
  { q: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: 1 },
  { q: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 2 },
  { q: 'Which ocean is the largest?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3 },
  { q: 'How many bones in the adult human body?', options: ['186', '206', '226', '256'], answer: 1 },
  { q: 'Which element has the atomic number 1?', options: ['Helium', 'Oxygen', 'Hydrogen', 'Carbon'], answer: 2 },
  { q: 'What is the speed of light in km/s (approx)?', options: ['150,000', '200,000', '300,000', '400,000'], answer: 2 },
  { q: 'What gas do plants absorb from the air?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Helium'], answer: 2 },
  { q: 'Which animal is the tallest?', options: ['Elephant', 'Giraffe', 'Horse', 'Camel'], answer: 1 },
  { q: 'What is the hardest natural substance?', options: ['Gold', 'Iron', 'Diamond', 'Platinum'], answer: 2 },
  { q: 'How many chambers does a human heart have?', options: ['2', '3', '4', '5'], answer: 2 },
  { q: 'What is the chemical symbol for water?', options: ['HO', 'H2O', 'H3O', 'HO2'], answer: 1 },
  { q: 'Which blood type is the universal donor?', options: ['A', 'B', 'AB', 'O'], answer: 3 },
  { q: 'What is the largest planet in our solar system?', options: ['Saturn', 'Jupiter', 'Neptune', 'Uranus'], answer: 1 },
  { q: 'How many degrees are in a circle?', options: ['180', '270', '360', '450'], answer: 2 },
  { q: 'What is the chemical symbol for silver?', options: ['Si', 'Ag', 'Sv', 'Sr'], answer: 1 },
  { q: 'Which gas makes up about 78% of Earth atmosphere?', options: ['Oxygen', 'Carbon Dioxide', 'Nitrogen', 'Argon'], answer: 2 },
  { q: 'What is the smallest unit of matter?', options: ['Molecule', 'Atom', 'Electron', 'Proton'], answer: 1 },
  { q: 'How many continents are there?', options: ['5', '6', '7', '8'], answer: 2 },
  { q: 'Which planet has the most moons?', options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], answer: 1 },

  // History
  { q: 'What year did the Titanic sink?', options: ['1905', '1912', '1918', '1923'], answer: 1 },
  { q: 'In what year did World War II end?', options: ['1943', '1944', '1945', '1946'], answer: 2 },
  { q: 'Which country invented pizza?', options: ['Greece', 'France', 'Italy', 'Spain'], answer: 2 },
  { q: 'In what year did the Berlin Wall fall?', options: ['1987', '1988', '1989', '1990'], answer: 2 },
  { q: 'Who was the first person to walk on the moon?', options: ['Buzz Aldrin', 'Neil Armstrong', 'John Glenn', 'Alan Shepard'], answer: 1 },
  { q: 'Which war was fought between the North and South in America?', options: ['Revolutionary War', 'Civil War', 'War of 1812', 'Mexican War'], answer: 1 },
  { q: 'What year did the Great Depression begin?', options: ['1928', '1929', '1930', '1931'], answer: 1 },
  { q: 'Who painted the Mona Lisa?', options: ['Michelangelo', 'Vincent van Gogh', 'Leonardo da Vinci', 'Pablo Picasso'], answer: 2 },
  { q: 'Which empire was ruled by Julius Caesar?', options: ['Greek', 'Roman', 'Persian', 'Egyptian'], answer: 1 },
  { q: 'In what year was the first iPhone released?', options: ['2006', '2007', '2008', '2009'], answer: 1 },

  // Technology & Computing
  { q: 'What does "HTTP" stand for?', options: ['HyperText Transfer Protocol', 'High Tech Transfer Program', 'HyperText Transmission Port', 'Home Tool Transfer Protocol'], answer: 0 },
  { q: 'Who founded Microsoft?', options: ['Steve Jobs', 'Bill Gates', 'Larry Page', 'Mark Zuckerberg'], answer: 1 },
  { q: 'What does "CPU" stand for?', options: ['Computer Processing Unit', 'Central Processing Unit', 'Core Processing Unit', 'Central Performance Unit'], answer: 1 },
  { q: 'Which company created the iPhone?', options: ['Samsung', 'Google', 'Apple', 'Microsoft'], answer: 2 },
  { q: 'What does "WWW" stand for?', options: ['World Wide Web', 'World Web Works', 'Web World Wide', 'Wide World Web'], answer: 0 },
  { q: 'Which programming language was created by Guido van Rossum?', options: ['Java', 'Python', 'C++', 'JavaScript'], answer: 1 },
  { q: 'What does "AI" stand for?', options: ['Automated Intelligence', 'Artificial Intelligence', 'Advanced Intelligence', 'Assisted Intelligence'], answer: 1 },
  { q: 'Which social media platform has a bird as its logo?', options: ['Facebook', 'Instagram', 'Twitter', 'LinkedIn'], answer: 2 },
  { q: 'What does "URL" stand for?', options: ['Universal Resource Locator', 'Uniform Resource Locator', 'Universal Reference Link', 'Uniform Reference Locator'], answer: 1 },

  // Sports & Entertainment
  { q: 'How many strings does a standard guitar have?', options: ['4', '5', '6', '7'], answer: 2 },
  { q: 'How many players are on a basketball team on the court?', options: ['4', '5', '6', '7'], answer: 1 },
  { q: 'In which sport would you perform a slam dunk?', options: ['Volleyball', 'Basketball', 'Tennis', 'Baseball'], answer: 1 },
  { q: 'How many holes are there in a full round of golf?', options: ['16', '17', '18', '19'], answer: 2 },
  { q: 'Which movie features the line "May the Force be with you"?', options: ['Star Trek', 'Star Wars', 'Guardians of the Galaxy', 'Avengers'], answer: 1 },
  { q: 'Who wrote the Harry Potter series?', options: ['J.R.R. Tolkien', 'Stephen King', 'J.K. Rowling', 'George R.R. Martin'], answer: 2 },
  { q: 'How many keys does a standard piano have?', options: ['76', '82', '88', '94'], answer: 2 },
  { q: 'In chess, which piece can only move diagonally?', options: ['Rook', 'Bishop', 'Knight', 'Queen'], answer: 1 },
  { q: 'What sport is played at Wimbledon?', options: ['Golf', 'Cricket', 'Tennis', 'Rugby'], answer: 2 },

  // Food & Culture
  { q: 'Which spice is derived from the Crocus flower?', options: ['Paprika', 'Saffron', 'Turmeric', 'Cardamom'], answer: 1 },
  { q: 'What is the main ingredient in guacamole?', options: ['Tomato', 'Avocado', 'Lime', 'Onion'], answer: 1 },
  { q: 'Which country is famous for inventing pasta?', options: ['China', 'Greece', 'Italy', 'France'], answer: 2 },
  { q: 'What type of pastry is used to make profiteroles?', options: ['Puff pastry', 'Choux pastry', 'Phyllo pastry', 'Shortcrust pastry'], answer: 1 },
  { q: 'Which herb is commonly used in pesto?', options: ['Oregano', 'Thyme', 'Basil', 'Rosemary'], answer: 2 },
  { q: 'What is the most consumed beverage after water?', options: ['Coffee', 'Tea', 'Soda', 'Beer'], answer: 1 },
  { q: 'Which vitamin is produced when skin is exposed to sunlight?', options: ['Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin E'], answer: 2 },
  { q: 'What is the hottest chili pepper in the world?', options: ['Carolina Reaper', 'Ghost Pepper', 'Habanero', 'Jalapeño'], answer: 0 },

  // Mathematics
  { q: 'What is 15% of 200?', options: ['25', '30', '35', '40'], answer: 1 },
  { q: 'What is the square root of 144?', options: ['11', '12', '13', '14'], answer: 1 },
  { q: 'What is 8 x 9?', options: ['72', '73', '74', '81'], answer: 0 },
  { q: 'How many minutes are in a day?', options: ['1,440', '1,400', '1,480', '1,500'], answer: 0 },
  { q: 'What is the value of Pi to 2 decimal places?', options: ['3.14', '3.15', '3.16', '3.17'], answer: 0 },
  { q: 'What comes next in the sequence: 2, 4, 8, 16...?', options: ['24', '28', '30', '32'], answer: 3 },
  { q: 'What is 25% of 80?', options: ['15', '20', '25', '30'], answer: 1 },
  { q: 'In Roman numerals, what does "L" represent?', options: ['50', '100', '500', '1000'], answer: 0 },

  // Literature & Arts
  { q: 'Who wrote "Romeo and Juliet"?', options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'], answer: 1 },
  { q: 'Which artist painted "The Starry Night"?', options: ['Pablo Picasso', 'Claude Monet', 'Vincent van Gogh', 'Leonardo da Vinci'], answer: 2 },
  { q: 'What is the first book in the Chronicles of Narnia series?', options: ['Prince Caspian', 'The Lion, the Witch and the Wardrobe', 'The Magician\'s Nephew', 'The Horse and His Boy'], answer: 1 },
  { q: 'Who composed "The Four Seasons"?', options: ['Mozart', 'Beethoven', 'Vivaldi', 'Bach'], answer: 2 },
  { q: 'Which novel begins with "It was the best of times, it was the worst of times"?', options: ['Great Expectations', 'Oliver Twist', 'A Tale of Two Cities', 'David Copperfield'], answer: 2 },

  // General Knowledge
  { q: 'What does "www" stand for in a website address?', options: ['World Wide Web', 'World Web Works', 'Web World Wide', 'Wide World Web'], answer: 0 },
  { q: 'How many time zones are there in the world?', options: ['20', '24', '28', '32'], answer: 1 },
  { q: 'What is the currency of the United Kingdom?', options: ['Euro', 'Dollar', 'Pound Sterling', 'Franc'], answer: 2 },
  { q: 'Which organ in the human body produces insulin?', options: ['Liver', 'Kidney', 'Pancreas', 'Stomach'], answer: 2 },
  { q: 'What is the largest mammal in the world?', options: ['African Elephant', 'Blue Whale', 'Giraffe', 'Hippopotamus'], answer: 1 }
];

module.exports = {
  id: 'trivia-blitz',
  name: 'Trivia Blitz',
  description: 'Answer fast! Points for speed and accuracy.',
  icon: '🧠',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: 7,

  init(room, io) {
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
    room.gameState = {
      questions: shuffled.slice(0, this.rounds),
      round: 0,
      totalRounds: this.rounds,
      phase: 'waiting',
      answers: new Map(),
      questionStart: null,
      answerShown: false,
      currentRoundTimer: null // BUG FIX: track the specific round timer
    };
    room._tvTimers = [];
    this._nextQuestion(room, io);
  },

  _addTimer(room, timer) {
    if (!room._tvTimers) room._tvTimers = [];
    room._tvTimers.push(timer);
  },

  _nextQuestion(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.answers = new Map();
    gs.answerShown = false;

    // BUG FIX: cancel any leftover round timer from previous round
    if (gs.currentRoundTimer) {
      clearTimeout(gs.currentRoundTimer);
      gs.currentRoundTimer = null;
    }

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    const q = gs.questions[gs.round - 1];
    gs.phase = 'question';
    gs.questionStart = Date.now();

    // Tag the round number so timer can verify it's still the right round
    const thisRound = gs.round;

    io.to(room.code).emit('game:state', {
      phase: 'question',
      round: gs.round,
      totalRounds: gs.totalRounds,
      question: q.q,
      options: q.options,
      timeLimit: 10
    });

    // BUG FIX: store timer ref and verify round hasn't changed when it fires
    gs.currentRoundTimer = setTimeout(() => {
      if (gs.round === thisRound && !gs.answerShown) {
        this._showAnswer(room, io);
      }
    }, 10000);
    this._addTimer(room, gs.currentRoundTimer);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'answer' || gs.phase !== 'question') return;
    if (gs.answers.has(socket.id)) return;
    if (typeof data.choice !== 'number') return; // validate input

    const elapsed = Date.now() - gs.questionStart;
    gs.answers.set(socket.id, { choice: data.choice, time: elapsed });

    // Count only non-disconnected players for the "all answered" check
    let activePlayers = 0;
    for (const [, p] of room.players) {
      if (!p.disconnected) activePlayers++;
    }

    if (gs.answers.size >= activePlayers && !gs.answerShown) {
      this._showAnswer(room, io);
    }
  },

  _showAnswer(room, io) {
    const gs = room.gameState;
    if (gs.answerShown) return;
    if (gs.phase === 'finished') return;

    const q = gs.questions[gs.round - 1];
    if (!q) return; // Guard: round beyond question list

    gs.answerShown = true;
    gs.phase = 'answer';

    // BUG FIX: cancel the round timer since we're showing the answer now
    if (gs.currentRoundTimer) {
      clearTimeout(gs.currentRoundTimer);
      gs.currentRoundTimer = null;
    }
    const results = [];

    for (const [id, ans] of gs.answers) {
      const player = room.players.get(id);
      if (!player) continue;
      const correct = ans.choice === q.answer;
      let points = 0;
      if (correct) {
        points = 100 + Math.max(0, Math.floor((10000 - ans.time) / 80));
        player.score += points;
      }
      results.push({ id, name: player.name, correct, points, time: ans.time });
    }
    results.sort((a, b) => b.points - a.points);

    io.to(room.code).emit('game:state', {
      phase: 'answer',
      correctIndex: q.answer,
      correctText: q.options[q.answer],
      results
    });

    const t = setTimeout(() => this._nextQuestion(room, io), 4000);
    this._addTimer(room, t);
  },

  _endGame(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'finished') return;
    gs.phase = 'finished';
    if (gs.currentRoundTimer) {
      clearTimeout(gs.currentRoundTimer);
      gs.currentRoundTimer = null;
    }
    const scores = [];
    for (const [id, p] of room.players) {
      scores.push({ id, name: p.name, score: p.score });
    }
    scores.sort((a, b) => b.score - a.score);
    io.to(room.code).emit('game:end', { scores });
    room.state = 'results';
  },

  getReconnectState(room) {
    const gs = room.gameState;
    if (!gs) return null;
    if (gs.phase === 'question') {
      const q = gs.questions[gs.round - 1];
      const elapsed = Date.now() - gs.questionStart;
      const remaining = Math.max(0, 15000 - elapsed);
      return {
        phase: 'question',
        round: gs.round,
        totalRounds: gs.totalRounds,
        question: q?.question,
        options: q?.options,
        timeLimit: remaining,
        answeredPlayers: Array.from(gs.answers.keys()).map(id => {
          const p = room.players.get(id);
          return p ? p.name : 'Unknown';
        })
      };
    }
    if (gs.phase === 'answer') {
      const q = gs.questions[gs.round - 1];
      return {
        phase: 'answer',
        round: gs.round,
        totalRounds: gs.totalRounds,
        question: q?.question,
        options: q?.options,
        correctIndex: q?.answer,
        results: gs.results
      };
    }
    return null;
  },

  cleanup(room) {
    if (room.gameState?.currentRoundTimer) {
      clearTimeout(room.gameState.currentRoundTimer);
    }
    if (room._tvTimers) {
      room._tvTimers.forEach(t => clearTimeout(t));
      room._tvTimers = [];
    }
  }
};
