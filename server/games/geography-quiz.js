// Geography Quiz — 10 rounds of geography multiple-choice, speed bonus scoring
const { plainObject, finiteInteger, migrateIdentity } = require('./_shared');

const QUESTIONS = [
  { q: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Brisbane'], answer: 2 },
  { q: 'What is the largest country by area?', options: ['Russia', 'Canada', 'China', 'United States'], answer: 0 },
  { q: 'Which river is the longest in the world?', options: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], answer: 1 },
  { q: 'What is the capital of Brazil?', options: ['Rio de Janeiro', 'São Paulo', 'Brasília', 'Salvador'], answer: 2 },
  { q: 'Which country is home to the Great Barrier Reef?', options: ['Australia', 'Indonesia', 'Philippines', 'Thailand'], answer: 0 },
  { q: 'What is the capital of Canada?', options: ['Toronto', 'Ottawa', 'Vancouver', 'Montreal'], answer: 1 },
  { q: 'Which continent has the most countries?', options: ['Asia', 'Europe', 'Africa', 'South America'], answer: 2 },
  { q: 'What is the smallest country in the world?', options: ['Monaco', 'San Marino', 'Liechtenstein', 'Vatican City'], answer: 3 },
  { q: 'What is the capital of Japan?', options: ['Osaka', 'Kyoto', 'Yokohama', 'Tokyo'], answer: 3 },
  { q: 'Which desert is the largest in the world?', options: ['Gobi', 'Kalahari', 'Sahara', 'Arabian'], answer: 2 },
  { q: 'What is the capital of South Korea?', options: ['Busan', 'Seoul', 'Incheon', 'Daegu'], answer: 1 },
  { q: 'Which mountain is the tallest in the world?', options: ['K2', 'Kangchenjunga', 'Mount Everest', 'Lhotse'], answer: 2 },
  { q: 'What is the capital of Egypt?', options: ['Alexandria', 'Cairo', 'Luxor', 'Giza'], answer: 1 },
  { q: 'Which country has the most population?', options: ['United States', 'Indonesia', 'India', 'China'], answer: 2 },
  { q: 'What is the capital of Turkey?', options: ['Istanbul', 'Ankara', 'Izmir', 'Antalya'], answer: 1 },
  { q: 'Which lake is the largest by surface area?', options: ['Lake Victoria', 'Lake Superior', 'Caspian Sea', 'Lake Huron'], answer: 2 },
  { q: 'What is the capital of New Zealand?', options: ['Auckland', 'Christchurch', 'Wellington', 'Hamilton'], answer: 2 },
  { q: 'Which country is known as the Land of the Rising Sun?', options: ['China', 'Thailand', 'Japan', 'South Korea'], answer: 2 },
  { q: 'What is the capital of Argentina?', options: ['Córdoba', 'Buenos Aires', 'Rosario', 'Mendoza'], answer: 1 },
  { q: 'Which African country has the largest population?', options: ['South Africa', 'Ethiopia', 'Nigeria', 'Egypt'], answer: 2 },
  { q: 'What is the capital of Thailand?', options: ['Chiang Mai', 'Phuket', 'Bangkok', 'Pattaya'], answer: 2 },
  { q: 'Which strait separates Europe from Africa?', options: ['Strait of Hormuz', 'Strait of Gibraltar', 'Bosphorus', 'Strait of Malacca'], answer: 1 },
  { q: 'What is the capital of Kenya?', options: ['Mombasa', 'Kisumu', 'Nairobi', 'Nakuru'], answer: 2 },
  { q: 'Which country has the most time zones?', options: ['Russia', 'United States', 'France', 'China'], answer: 2 },
  { q: 'What is the capital of Peru?', options: ['Cusco', 'Lima', 'Arequipa', 'Trujillo'], answer: 1 },
  { q: 'Which island is the largest in the world?', options: ['Borneo', 'Madagascar', 'Greenland', 'New Guinea'], answer: 2 },
  { q: 'What is the capital of Nigeria?', options: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt'], answer: 1 },
  { q: 'Which country is shaped like a boot?', options: ['Greece', 'Spain', 'Italy', 'Portugal'], answer: 2 },
  { q: 'What is the capital of India?', options: ['Mumbai', 'Kolkata', 'New Delhi', 'Bangalore'], answer: 2 },
  { q: 'Which ocean is the smallest?', options: ['Indian', 'Atlantic', 'Southern', 'Arctic'], answer: 3 },
  { q: 'What is the capital of Morocco?', options: ['Casablanca', 'Marrakech', 'Fez', 'Rabat'], answer: 3 },
  { q: 'Which South American country is the largest?', options: ['Argentina', 'Colombia', 'Brazil', 'Peru'], answer: 2 },
  { q: 'What is the capital of Vietnam?', options: ['Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Hue'], answer: 1 },
  { q: 'Which European country has the most UNESCO World Heritage Sites?', options: ['France', 'Spain', 'Italy', 'Germany'], answer: 2 },
  { q: 'What is the capital of Switzerland?', options: ['Zurich', 'Geneva', 'Bern', 'Basel'], answer: 2 },
  { q: 'Which waterfall is the tallest in the world?', options: ['Niagara Falls', 'Victoria Falls', 'Angel Falls', 'Iguazu Falls'], answer: 2 },
  { q: 'What is the capital of Myanmar?', options: ['Yangon', 'Mandalay', 'Naypyidaw', 'Bago'], answer: 2 },
  { q: 'Which country spans two continents?', options: ['Egypt', 'Turkey', 'Russia', 'All of these'], answer: 3 },
  { q: 'What is the capital of Pakistan?', options: ['Karachi', 'Lahore', 'Islamabad', 'Peshawar'], answer: 2 },
  { q: 'Which country has the longest coastline?', options: ['Australia', 'Indonesia', 'Canada', 'Russia'], answer: 2 },
  { q: 'What is the capital of Colombia?', options: ['Medellín', 'Bogotá', 'Cali', 'Cartagena'], answer: 1 },
  { q: 'Which sea is the saltiest in the world?', options: ['Red Sea', 'Dead Sea', 'Caspian Sea', 'Black Sea'], answer: 1 },
  { q: 'What is the capital of Ethiopia?', options: ['Dire Dawa', 'Addis Ababa', 'Gondar', 'Mekelle'], answer: 1 },
  { q: 'Which country is home to Machu Picchu?', options: ['Bolivia', 'Ecuador', 'Peru', 'Chile'], answer: 2 },
  { q: 'What is the capital of the Philippines?', options: ['Cebu', 'Davao', 'Manila', 'Quezon City'], answer: 2 },
  
  // More Capitals
  { q: 'What is the capital of Chile?', options: ['Santiago', 'Valparaíso', 'Concepción', 'Antofagasta'], answer: 0 },
  { q: 'What is the capital of Finland?', options: ['Tampere', 'Turku', 'Helsinki', 'Espoo'], answer: 2 },
  { q: 'What is the capital of Norway?', options: ['Bergen', 'Stavanger', 'Trondheim', 'Oslo'], answer: 3 },
  { q: 'What is the capital of Austria?', options: ['Salzburg', 'Vienna', 'Innsbruck', 'Graz'], answer: 1 },
  { q: 'What is the capital of Bangladesh?', options: ['Chittagong', 'Dhaka', 'Sylhet', 'Rajshahi'], answer: 1 },
  { q: 'What is the capital of Czech Republic?', options: ['Brno', 'Prague', 'Ostrava', 'Plzen'], answer: 1 },
  { q: 'What is the capital of Hungary?', options: ['Debrecen', 'Szeged', 'Budapest', 'Miskolc'], answer: 2 },
  { q: 'What is the capital of Ukraine?', options: ['Kharkiv', 'Kyiv', 'Odesa', 'Lviv'], answer: 1 },
  { q: 'What is the capital of Slovakia?', options: ['Košice', 'Bratislava', 'Prešov', 'Žilina'], answer: 1 },
  { q: 'What is the capital of Croatia?', options: ['Split', 'Zagreb', 'Dubrovnik', 'Rijeka'], answer: 1 },
  { q: 'What is the capital of Slovenia?', options: ['Maribor', 'Ljubljana', 'Kranj', 'Celje'], answer: 1 },
  { q: 'What is the capital of Lebanon?', options: ['Tripoli', 'Beirut', 'Sidon', 'Tyre'], answer: 1 },
  { q: 'What is the capital of Jordan?', options: ['Amman', 'Irbid', 'Zarqa', 'Aqaba'], answer: 0 },
  { q: 'What is the capital of Uruguay?', options: ['Salto', 'Paysandú', 'Montevideo', 'Las Piedras'], answer: 2 },
  { q: 'What is the capital of Paraguay?', options: ['Ciudad del Este', 'San Lorenzo', 'Asunción', 'Lambaré'], answer: 2 },
  
  // Geography Features
  { q: 'Which mountain range separates Europe from Asia?', options: ['Himalayas', 'Alps', 'Ural Mountains', 'Caucasus'], answer: 2 },
  { q: 'What is the deepest ocean trench?', options: ['Puerto Rico Trench', 'Java Trench', 'Mariana Trench', 'Peru-Chile Trench'], answer: 2 },
  { q: 'Which river flows through Paris?', options: ['Rhine', 'Seine', 'Loire', 'Rhône'], answer: 1 },
  { q: 'What is the highest waterfall in the world?', options: ['Niagara Falls', 'Victoria Falls', 'Angel Falls', 'Iguazu Falls'], answer: 2 },
  { q: 'Which desert is located in northern Africa?', options: ['Kalahari', 'Namib', 'Sahara', 'Gobi'], answer: 2 },
  { q: 'What is the longest mountain range in the world?', options: ['Himalayas', 'Rocky Mountains', 'Andes', 'Alps'], answer: 2 },
  { q: 'Which lake is the deepest in the world?', options: ['Lake Superior', 'Lake Baikal', 'Lake Tanganyika', 'Lake Victoria'], answer: 1 },
  { q: 'What is the smallest ocean?', options: ['Atlantic', 'Indian', 'Arctic', 'Southern'], answer: 2 },
  { q: 'Which volcano destroyed Pompeii?', options: ['Etna', 'Vesuvius', 'Stromboli', 'Vulcano'], answer: 1 },
  { q: 'What is the largest hot desert in the world?', options: ['Gobi', 'Arabian', 'Sahara', 'Thar'], answer: 2 },
  
  // Countries and Regions
  { q: 'Which country has the most islands?', options: ['Norway', 'Sweden', 'Finland', 'Canada'], answer: 1 },
  { q: 'What is the largest landlocked country?', options: ['Mongolia', 'Chad', 'Kazakhstan', 'Afghanistan'], answer: 2 },
  { q: 'Which European country is known for its tulips?', options: ['Belgium', 'Netherlands', 'Denmark', 'Germany'], answer: 1 },
  { q: 'What is the southernmost continent?', options: ['South America', 'Australia', 'Africa', 'Antarctica'], answer: 3 },
  { q: 'Which country is both an island and a continent?', options: ['Greenland', 'Madagascar', 'Australia', 'New Guinea'], answer: 2 },
  { q: 'What is the largest archipelago in the world?', options: ['Philippines', 'Indonesia', 'Japan', 'Greece'], answer: 1 },
  { q: 'Which country shares borders with both China and Russia?', options: ['Kazakhstan', 'Mongolia', 'North Korea', 'All of these'], answer: 3 },
  { q: 'What is the most densely populated country?', options: ['Singapore', 'Monaco', 'Malta', 'Bangladesh'], answer: 1 },
  { q: 'Which African country was never colonized?', options: ['Ethiopia', 'Liberia', 'Somalia', 'Both A and B'], answer: 3 },
  
  // Flags and Symbols
  { q: 'Which country has a maple leaf on its flag?', options: ['United States', 'Australia', 'Canada', 'New Zealand'], answer: 2 },
  { q: 'Which country\'s flag has a dragon on it?', options: ['Wales', 'Bhutan', 'China', 'Both A and B'], answer: 3 },
  { q: 'Which country has a sun on its flag?', options: ['Japan', 'Argentina', 'Uruguay', 'All of these'], answer: 3 },
  { q: 'Which Nordic country\'s flag does NOT have a cross?', options: ['All have crosses', 'Iceland', 'Norway', 'Finland'], answer: 0 },
  
  // Languages and Currencies
  { q: 'What is the official language of Brazil?', options: ['Spanish', 'Portuguese', 'Italian', 'French'], answer: 1 },
  { q: 'Which language is spoken in the most countries?', options: ['English', 'French', 'Spanish', 'Arabic'], answer: 1 },
  { q: 'What is the currency of Japan?', options: ['Won', 'Yuan', 'Yen', 'Ringgit'], answer: 2 },
  { q: 'What is the currency of India?', options: ['Rupee', 'Taka', 'Peso', 'Dinar'], answer: 0 },
  { q: 'Which country uses the Euro but is not in the EU?', options: ['Montenegro', 'Kosovo', 'Andorra', 'All of these'], answer: 3 },
  
  // Climate and Time Zones
  { q: 'Which country straddles the most time zones?', options: ['Russia', 'United States', 'China', 'France'], answer: 0 },
  { q: 'What is the driest place on Earth?', options: ['Sahara Desert', 'Death Valley', 'Atacama Desert', 'Antarctic Dry Valleys'], answer: 2 },
  { q: 'Which line of latitude divides the Earth into Northern and Southern hemispheres?', options: ['Tropic of Cancer', 'Tropic of Capricorn', 'Equator', 'Prime Meridian'], answer: 2 },
  { q: 'At 0 degrees longitude, which line passes through Greenwich?', options: ['International Date Line', 'Prime Meridian', 'Equator', 'Tropic of Cancer'], answer: 1 },
  
  // Economic Geography
  { q: 'Which country produces the most coffee?', options: ['Colombia', 'Vietnam', 'Brazil', 'Ethiopia'], answer: 2 },
  { q: 'Which country has the most oil reserves?', options: ['Saudi Arabia', 'Venezuela', 'Iran', 'Iraq'], answer: 1 },
  { q: 'What is the busiest shipping canal in the world?', options: ['Panama Canal', 'Suez Canal', 'Corinth Canal', 'Kiel Canal'], answer: 1 },
  { q: 'Which city hosts the world\'s busiest airport by passenger traffic?', options: ['London Heathrow', 'Dubai International', 'Atlanta Hartsfield', 'Los Angeles LAX'], answer: 2 },
  
  // Miscellaneous
  { q: 'Which sea lies between Italy and the Balkans?', options: ['Tyrrhenian Sea', 'Ionian Sea', 'Adriatic Sea', 'Aegean Sea'], answer: 2 },
  { q: 'What is the Great Barrier Reef primarily composed of?', options: ['Rock', 'Sand', 'Coral', 'Seaweed'], answer: 2 },
  { q: 'Which peninsula is shared by Norway and Sweden?', options: ['Iberian', 'Scandinavian', 'Jutland', 'Kola'], answer: 1 },
  { q: 'What is the Ring of Fire?', options: ['Desert region', 'Mountain range', 'Volcanic zone', 'Ocean current'], answer: 2 }
];

const TOTAL_ROUNDS = 10;
const TIMER_MS = 15000;
const RESULTS_PAUSE_MS = 3000;
const LETTERS = ['A', 'B', 'C', 'D'];

module.exports = {
  id: 'geography-quiz',
  name: 'Geography Quiz',
  description: 'Test your world knowledge! Answer geography questions for points.',
  icon: '🌍',
  minPlayers: 2,
  maxPlayers: 20,

  init(room, io) {
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
    room.gameState = {
      questions: shuffled.slice(0, TOTAL_ROUNDS),
      round: 0,
      totalRounds: TOTAL_ROUNDS,
      phase: 'waiting',
      answers: new Map(),
      questionStart: null,
      answerShown: false,
      currentRoundTimer: null
    };
    room._gqTimers = [];
    this._nextQuestion(room, io);
  },

  _addTimer(room, timer) {
    if (!room._gqTimers) room._gqTimers = [];
    room._gqTimers.push(timer);
  },

  _nextQuestion(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.answers = new Map();
    gs.answerShown = false;

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

    const thisRound = gs.round;

    io.to(room.code).emit('game:state', {
      phase: 'question',
      round: gs.round,
      totalRounds: gs.totalRounds,
      question: q.q,
      options: q.options,
      timeLimit: TIMER_MS / 1000
    });

    gs.currentRoundTimer = setTimeout(() => {
      if (gs.round === thisRound && !gs.answerShown) {
        this._showAnswer(room, io);
      }
    }, TIMER_MS);
    this._addTimer(room, gs.currentRoundTimer);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'answer' || gs.phase !== 'question' || !plainObject(data)) return;
    if (gs.answers.has(socket.id)) return;
    const player = room.players.get(socket.id);
    if (!player || player.disconnected) return;

    const choice = data.choice;
    if (!finiteInteger(choice, 0, 3) || Date.now() - gs.questionStart > TIMER_MS) return;

    const elapsed = Date.now() - gs.questionStart;
    gs.answers.set(socket.id, { choice, time: elapsed });

    // Notify others that this player answered
    io.to(room.code).emit('game:state', {
      phase: 'player-answered',
      playerId: socket.id,
      playerName: player.name
    });

    // Check if all active players answered
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
    if (!q) return;

    gs.answerShown = true;
    gs.phase = 'answer';

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
        // 1000 base + up to 500 speed bonus based on time remaining
        const timeRemaining = Math.max(0, TIMER_MS - ans.time);
        points = 1000 + Math.floor((timeRemaining / TIMER_MS) * 500);
        player.score += points;
      }
      results.push({ id, name: player.name, correct, points, time: ans.time, choice: ans.choice });
    }
    results.sort((a, b) => b.points - a.points);
    gs.results = results;

    // Build scoreboard
    const scores = [];
    for (const [id, p] of room.players) {
      scores.push({ id, name: p.name, score: p.score });
    }
    scores.sort((a, b) => b.score - a.score);

    gs.resultState = {
      phase: 'answer',
      round: gs.round,
      totalRounds: gs.totalRounds,
      question: q.q,
      options: q.options,
      correctIndex: q.answer,
      correctText: q.options[q.answer],
      results,
      scores
    };
    io.to(room.code).emit('game:state', gs.resultState);

    const t = setTimeout(() => this._nextQuestion(room, io), RESULTS_PAUSE_MS);
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

  // Bot AI
  getBotMove(room, bot) {
    const gs = room.gameState;
    if (gs.phase !== 'question') return null;
    if (gs.answers.has(bot.id)) return null;

    const q = gs.questions[gs.round - 1];
    if (!q) return null;

    const difficulty = bot.difficulty || 'medium';
    let correctChance, delayMs;
    if (difficulty === 'easy') { correctChance = 0.4; delayMs = 12000; }
    else if (difficulty === 'hard') { correctChance = 0.9; delayMs = 2000; }
    else { correctChance = 0.65; delayMs = 7000; }

    const elapsed = Date.now() - gs.questionStart;
    if (elapsed < delayMs) return null;

    let choice;
    if (Math.random() < correctChance) {
      choice = q.answer;
    } else {
      const wrong = [0, 1, 2, 3].filter(i => i !== q.answer);
      choice = wrong[Math.floor(Math.random() * wrong.length)];
    }

    return { event: 'answer', data: { choice } };
  },

  getReconnectState(room, playerId) {
    const gs = room.gameState;
    if (!gs) return null;
    if (gs.phase === 'question') {
      const q = gs.questions[gs.round - 1];
      const elapsed = Date.now() - gs.questionStart;
      const remaining = Math.max(0, TIMER_MS - elapsed);
      return {
        phase: 'question',
        round: gs.round,
        totalRounds: gs.totalRounds,
        question: q.q,
        options: q?.options,
        timeLimit: remaining
      };
    }
    if (gs.phase === 'answer') {
      return { ...gs.resultState };
    }
    return null;
  },

  migratePlayerIdentity(room, oldId, newId) {
    migrateIdentity(room.gameState, oldId, newId, { maps: ['answers'] });
    (room.gameState?.results || []).forEach(r => { if (r.id === oldId) r.id = newId; });
  },

  cleanup(room) {
    if (room.gameState?.currentRoundTimer) {
      clearTimeout(room.gameState.currentRoundTimer);
    }
    if (room._gqTimers) {
      room._gqTimers.forEach(t => clearTimeout(t));
      room._gqTimers = [];
    }
  }
};
