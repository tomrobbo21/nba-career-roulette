
window.addEventListener("error", (event) => {
  const target = document.getElementById("stageContent");
  if (!target) return;
  target.innerHTML = `
    <section class="v50-stage-complete">
      <p class="v50-kicker">Runtime Error</p>
      <h2>Game failed to load</h2>
      <p>${String(event.message || "Unknown error")}</p>
      <button class="spin-button" onclick="localStorage.clear(); location.reload();">Reset and reload</button>
    </section>
  `;
});

const STORAGE_KEY = "nba-career-roulette-webapp-v1-save";

const wheelColors = [
  "#f45a1e",
  "#f2b52b",
  "#174f96",
  "#168a42",
  "#b3262f",
  "#7247c8",
  "#138a8a",
  "#df7b22",
  "#2c7a3f",
  "#8c2d16",
  "#475569",
  "#be185d"
];

const outcomeColourRoles = {
  negative: "rgba(38, 97, 172, 0.86)",
  positive: "rgba(0, 145, 72, 0.86)",
};

const balancedWheelColours = [
  "rgba(141, 92, 48, 0.84)",
  "rgba(153, 113, 37, 0.84)",
  "rgba(119, 72, 143, 0.84)",
  "rgba(156, 72, 88, 0.84)",
  "rgba(93, 112, 124, 0.84)",
  "rgba(126, 87, 70, 0.84)",
  "rgba(118, 99, 46, 0.84)",
  "rgba(128, 77, 121, 0.84)",
  "rgba(91, 92, 98, 0.84)",
  "rgba(162, 93, 50, 0.84)",
];

function getBalancedWheelColour(index) {
  return balancedWheelColours[index % balancedWheelColours.length];
}


function hexToRgb(color) {
  const value = String(color || '').trim();
  const match = value.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function applyGlassAlpha(color, alpha = 0.82) {
  if (!color) return `rgba(255,255,255,${alpha})`;
  if (String(color).startsWith('rgba')) return color;
  if (String(color).startsWith('rgb(')) {
    return String(color).replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}


function getOutcomePolarityScore(option) {
  const text = `${option?.label || ""} ${option?.wheelLabel || ""} ${option?.id || ""}`.toLowerCase();
  const numeric = Number(option?.impact ?? option?.value ?? option?.score ?? 0);
  let score = Number.isFinite(numeric) ? numeric : 0;

  if (/career ending|injury|scandal|waived|cut|retire|retirement|eliminated|miss|out|loss|no\b|negative|poor|bad|bust|two-way|undrafted|g-league/.test(text)) score -= 100;
  if (/champion|advance|win|yes\b|mvp|all-nba|all-star|dpoy|scoring|elite|generational|superstar|positive|lottery|top/.test(text)) score += 100;

  return score;
}

function applyPolarityColours(options, stageId = activeStageId) {
  if (!Array.isArray(options) || !options.length) return options;
  if (stageId === "position") return options;

  let minIndex = 0;
  let maxIndex = 0;
  const scores = options.map(getOutcomePolarityScore);

  scores.forEach((score, index) => {
    if (score < scores[minIndex]) minIndex = index;
    if (score > scores[maxIndex]) maxIndex = index;
  });

  if (minIndex === maxIndex) {
    return options.map((option, index) => ({
      ...option,
      backgroundColor: option.backgroundColor || getBalancedWheelColour(index),
    }));
  }

  return options.map((option, index) => ({
    ...option,
    backgroundColor: index === minIndex
      ? outcomeColourRoles.negative
      : index === maxIndex
        ? outcomeColourRoles.positive
        : getBalancedWheelColour(index),
  }));
}





function shouldVisuallySplitWheel(options = [], stageId = activeStageId) {
  if (stageId === "position") return false;
  return Array.isArray(options) && options.length === 2;
}

function getTwoOutcomeCounts(options, totalSegments = 12) {
  const weights = options.map((option) => Math.max(0.0001, Number(option.weight || 1)));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  const raw = weights.map((weight) => (weight / total) * totalSegments);
  const counts = raw.map((value) => Math.floor(value));
  let remainder = totalSegments - counts.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    counts[order[i].index] += 1;
    remainder -= 1;
  }

  return counts;
}

function rotateSequenceToTransition(sequence) {
  if (!sequence.length || sequence.every((item) => item === sequence[0])) return sequence;

  for (let i = 0; i < sequence.length; i += 1) {
    const previous = sequence[(i - 1 + sequence.length) % sequence.length];
    if (sequence[i] !== previous) {
      return sequence.slice(i).concat(sequence.slice(0, i));
    }
  }

  return sequence;
}

function collapseSequentialWheelItems(sequence, options, colours) {
  if (!sequence.length) return [];
  const collapsed = [];
  let currentIndex = sequence[0];
  let weight = 1;

  function pushSegment(optionIndex, segmentWeight) {
    const option = options[optionIndex];
    collapsed.push({
      label: option.wheelLabel || option.label,
      value: `${option.id}__visual_${collapsed.length}`,
      sourceValue: option.id,
      sourceIndex: optionIndex,
      weight: segmentWeight,
      backgroundColor: colours[optionIndex],
      labelColor: option.labelColor || "#ffffff",
    });
  }

  for (let i = 1; i < sequence.length; i += 1) {
    if (sequence[i] === currentIndex) {
      weight += 1;
    } else {
      pushSegment(currentIndex, weight);
      currentIndex = sequence[i];
      weight = 1;
    }
  }

  pushSegment(currentIndex, weight);
  return collapsed;
}



function buildEvenTwoOutcomeWheel(options, counts, colours) {
  const totalSegments = counts.reduce((sum, value) => sum + value, 0);
  let sequence = new Array(totalSegments).fill(null);
  const smallerIndex = counts[0] <= counts[1] ? 0 : 1;
  const largerIndex = smallerIndex === 0 ? 1 : 0;
  const smallerCount = counts[smallerIndex];

  for (let i = 0; i < smallerCount; i += 1) {
    const position = Math.floor(((i + 0.5) * totalSegments) / smallerCount) % totalSegments;
    sequence[position] = smallerIndex;
  }

  for (let i = 0; i < totalSegments; i += 1) {
    if (sequence[i] === null) sequence[i] = largerIndex;
  }

  sequence = rotateSequenceToTransition(sequence);

  return collapseSequentialWheelItems(sequence, options, colours);
}





function getAdaptiveTwoOutcomeCounts(options) {
  const candidateSegmentTotals = [10, 8, 6, 4];

  for (const totalSegments of candidateSegmentTotals) {
    const counts = getTwoOutcomeCounts(options, totalSegments);
    const smallerCount = Math.min(...counts);
    if (smallerCount >= 2) {
      return counts;
    }
  }

  return null;
}

function buildVisualWheelItems(options, stageId = activeStageId) {
  if (!(Array.isArray(options) && options.length === 2) || stageId === "position") {
    return options.map((option, index) => ({
      label: option.wheelLabel || option.label,
      value: option.id,
      sourceValue: option.id,
      sourceIndex: index,
      weight: Number(option.weight || 1),
      backgroundColor: applyGlassAlpha(option.backgroundColor || wheelColors[index % wheelColors.length], 0.84),
      labelColor: option.labelColor || "#ffffff",
    }));
  }

  const scores = options.map(getOutcomePolarityScore);
  const negativeIndex = scores[0] <= scores[1] ? 0 : 1;
  const positiveIndex = negativeIndex === 0 ? 1 : 0;

  const twoOutcomeColours = [];
  twoOutcomeColours[negativeIndex] = outcomeColourRoles.negative;
  twoOutcomeColours[positiveIndex] = outcomeColourRoles.positive;

  const counts = getAdaptiveTwoOutcomeCounts(options);

  if (!counts) {
    return options.map((option, index) => ({
      label: option.wheelLabel || option.label,
      value: option.id,
      sourceValue: option.id,
      sourceIndex: index,
      weight: Math.max(0.1, Number(option.weight || 1)),
      backgroundColor: twoOutcomeColours[index],
      labelColor: option.labelColor || "#ffffff",
    }));
  }

  return buildEvenTwoOutcomeWheel(options, counts, twoOutcomeColours);
}












const stageOrder = [
  "position",
  "height",
  "wingspan",
  "seniorNight",
  "collegeRecruitment",
  "collegeSelection",
  "freshmanYear",
  "sophomoreYear",
  "juniorYear",
  "seniorYear",
  "combine",
  "mockDraft",
  "drafted",
];

const collegeYearStages = ["freshmanYear", "sophomoreYear", "juniorYear", "seniorYear"];

const nbaTeams = [
  "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets", "Chicago Bulls",
  "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets", "Detroit Pistons", "Golden State Warriors",
  "Houston Rockets", "Indiana Pacers", "LA Clippers", "Los Angeles Lakers", "Memphis Grizzlies",
  "Miami Heat", "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
  "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns", "Portland Trail Blazers",
  "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors", "Utah Jazz", "Washington Wizards"
];



const teamThemes = {
  "Atlanta Hawks": ["#E03A3E", "#C1D32F"],
  "Boston Celtics": ["#007A33", "#BA9653"],
  "Brooklyn Nets": ["#000000", "#777777"],
  "Charlotte Hornets": ["#1D1160", "#00788C"],
  "Chicago Bulls": ["#CE1141", "#000000"],
  "Cleveland Cavaliers": ["#860038", "#FDBB30"],
  "Dallas Mavericks": ["#00538C", "#B8C4CA"],
  "Denver Nuggets": ["#0E2240", "#FEC524"],
  "Detroit Pistons": ["#C8102E", "#1D42BA"],
  "Golden State Warriors": ["#1D428A", "#FFC72C"],
  "Houston Rockets": ["#CE1141", "#FFFFFF"],
  "Indiana Pacers": ["#002D62", "#FDBB30"],
  "LA Clippers": ["#C8102E", "#1D428A"],
  "Los Angeles Lakers": ["#552583", "#FDB927"],
  "Memphis Grizzlies": ["#5D76A9", "#12173F"],
  "Miami Heat": ["#98002E", "#F9A01B"],
  "Milwaukee Bucks": ["#00471B", "#EEE1C6"],
  "Minnesota Timberwolves": ["#0C2340", "#78BE20"],
  "New Orleans Pelicans": ["#0C2340", "#C8102E"],
  "New York Knicks": ["#006BB6", "#F58426"],
  "Oklahoma City Thunder": ["#007AC1", "#EF3B24"],
  "Orlando Magic": ["#0077C0", "#C4CED4"],
  "Philadelphia 76ers": ["#006BB6", "#ED174C"],
  "Phoenix Suns": ["#1D1160", "#E56020"],
  "Portland Trail Blazers": ["#E03A3E", "#000000"],
  "Sacramento Kings": ["#5A2D81", "#63727A"],
  "San Antonio Spurs": ["#C4CED4", "#000000"],
  "Toronto Raptors": ["#CE1141", "#000000"],
  "Utah Jazz": ["#002B5C", "#F9A01B"],
  "Washington Wizards": ["#002B5C", "#E31837"],
};

const teamAbbreviations = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "LA Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};


const careerEndingInjuries = [
  "Ruptured Spleen",
  "Leg Break",
  "Blew Out Both Knees",
  "Torn Achilles During A Pregame Dance",
  "Shattered Shooting Hand In A Golf Cart Mishap",
  "Back Gave Out Tying Shoes",
  "Dislocated Shoulder Celebrating A Made Free Throw",
  "Catastrophic Hamstring Explosion",
];


const offseasonLifeEvents = [{"id": "offcourt_pop_star", "label": "Marry A Pop Star", "wheelLabel": "Marry A Pop Star", "summaryLabel": "Pop Star Marriage", "type": "positive", "weight": 1, "spinBoostChange": 1, "statShift": 1.5, "riskShift": -0.5, "legacyShift": 4, "copy": "You marry the world's biggest pop star - Madison Square Garden was booked though."}, {"id": "offcourt_minor_team", "label": "Buy a Minor League Team", "wheelLabel": "Buy Minor League Team", "summaryLabel": "Buy Minor League Team", "type": "positive", "weight": 1, "spinBoostChange": 1, "statShift": 1, "riskShift": -0.5, "legacyShift": 4, "copy": "We all love baseball right? Just don't get tempted to warm up the shoulder\u2026"}, {"id": "offcourt_chess", "label": "Secretly Good at Chess", "wheelLabel": "Secretly A Chess Grandmaster", "summaryLabel": "Chess Genius", "type": "positive", "weight": 1, "spinBoostChange": 1, "statShift": 1, "riskShift": -0.5, "legacyShift": 4, "copy": "E4 or D4 - you know the way. Magnus might end up in crowd for a few games this year."}, {"id": "offcourt_save_teammate", "label": "Save Teammate From Burning Building", "wheelLabel": "Save Teammate", "summaryLabel": "Save Teammate", "type": "positive", "weight": 1, "spinBoostChange": 1, "statShift": 2.5, "riskShift": -1, "legacyShift": 8, "copy": "Who needs 911? Stop, dropped and rolled your way out of there."}, {"id": "offcourt_charity", "label": "Start A Charity", "wheelLabel": "Start Charity", "summaryLabel": "Start Charity", "type": "positive", "weight": 1, "spinBoostChange": 1, "statShift": 2, "riskShift": -1, "legacyShift": 5, "copy": "You start a charity that actually works and the league leans into it hard. The fanbase buys in, the front office loves the leadership angle, and the media starts calling you a culture-setter. Next season gets a positive push and your legacy improves."}, {"id": "offcourt_kidney", "label": "Donate Your Kidney to Child", "wheelLabel": "Donate Kidney", "summaryLabel": "Donate Kidney", "type": "positive", "weight": 1, "spinBoostChange": 1, "statShift": 4, "riskShift": -2, "legacyShift": 8, "copy": "You donate your kidney to a child and become the league's most beloved human overnight. Every broadcast tells the story, teammates rally around you, and your public approval rating becomes absurd. Next season gets a major positive push and your legacy score gets a big boost."}, {"id": "offcourt_restaurant", "label": "Open a Booming Chinese Restaurant", "wheelLabel": "Open Restaurant", "summaryLabel": "Open Restaurant", "type": "positive", "weight": 1, "spinBoostChange": 1, "statShift": 2, "riskShift": -0.5, "legacyShift": 4, "copy": "You open a Chinese restaurant that becomes impossible to book. Teammates are there every night, fans quote the menu online, and your signature dumplings become part of local basketball culture. The good vibes create a small next-season boost and a fun legacy bump."}, {"id": "offcourt_divorce", "label": "Messy Divorce", "wheelLabel": "Messy Divorce", "summaryLabel": "Messy Divorce", "type": "negative", "weight": 1, "spinBoostChange": -1, "statShift": -1.5, "riskShift": 1.5, "legacyShift": -3, "copy": "Lucky your last contract wasn't for that much money I guess\u2026"}, {"id": "offcourt_crypto", "label": "Lose Crypto Fortune", "wheelLabel": "Lose Crypto", "summaryLabel": "Lose Crypto", "type": "negative", "weight": 1, "spinBoostChange": -1, "statShift": 0, "riskShift": 0.5, "legacyShift": -5, "copy": "Lost 40m on Dunkcoin. You probably should have known better, but hey, gotta spend money to make money right?"}, {"id": "offcourt_djing", "label": "Spend Offseason DJing in Cancun", "wheelLabel": "Offseason DJing", "summaryLabel": "Offseason DJing", "type": "negative", "weight": 1, "spinBoostChange": -1, "statShift": 0, "riskShift": 1, "legacyShift": -3, "forceTrainingFocus": "training_cancun", "copy": "Who needs training? You're already at the top of your game. Prepare to take over the stage from the big names."}, {"id": "offcourt_tiger", "label": "Buy a Tiger", "wheelLabel": "Buy a Tiger", "summaryLabel": "Buy a Tiger", "type": "negative", "weight": 1, "spinBoostChange": -1, "statShift": -1.5, "riskShift": 1.5, "legacyShift": -3, "copy": "Why do you need a tiger? Doesn't matter. However, you find out the hard way why they're maybe illegal as pets."}, {"id": "offcourt_podcast", "label": "Insensitive Comment on Podcast", "wheelLabel": "Podcast Comment", "summaryLabel": "Podcast Comment", "type": "negative", "weight": 1, "spinBoostChange": -1, "statShift": -3, "riskShift": 3, "legacyShift": -5, "copy": "A throwaway comment on a podcast turns into a full-week sports media cycle. Sponsors get nervous, fans are split, and every away arena has new material. Next season starts with a reputation penalty, slightly worse stat weighting and higher waived risk."}, {"id": "offcourt_eye", "label": "Lose an Eye in 4th July Accident", "wheelLabel": "Lose an Eye", "summaryLabel": "Lose an Eye", "type": "negative", "weight": 1, "spinBoostChange": -1, "statShift": -8, "riskShift": 8, "legacyShift": -6, "copy": "A 4th of July accident costs you an eye and throws the entire next season into chaos. Training camp becomes a medical documentary, the front office quietly panics, and every shot chart looks terrifying. Next season gets a very negative stat shift and a much higher waived risk, but a miracle comeback is still possible."}, {"id": "offcourt_betting", "label": "Involved In Betting Scandal", "wheelLabel": "Betting Scandal", "summaryLabel": "Betting Scandal", "type": "careerEnding", "weight": 5, "spinBoostChange": 0, "legacyShift": -15, "endsCareer": true, "copy": "A betting scandal explodes and there is no comeback arc. The investigation dominates the league, the team distances itself immediately, and the career ends on the spot. The final r\u00e9sum\u00e9 will remember this as the career-ending off-court disaster."}];

const trainingFocusOptions = [{"id": "training_points", "label": "Points Focus", "wheelLabel": "Points", "target": "points", "weight": 22, "copy": "You spend the offseason hunting buckets. Extra shooting reps, tighter handles and a green light in every scrimmage give your scoring profile a real lift. Next season's Points spinner gets a training boost."}, {"id": "training_rebounds", "label": "Rebounds Focus", "wheelLabel": "Rebounds", "target": "rebounds", "weight": 22, "copy": "You turn the offseason into a rebounding boot camp. Box-outs, strength work and a slightly worrying obsession with missed shots all pay off. Next season's Rebounds spinner gets a training boost."}, {"id": "training_assists", "label": "Assists Focus", "wheelLabel": "Assists", "target": "assists", "weight": 22, "copy": "You lock in on playmaking all summer. Film sessions, passing drills and a new love for throwing teammates open sharpen the whole offence. Next season's Assists spinner gets a training boost."}, {"id": "training_defense", "label": "Defence Focus", "wheelLabel": "Defence", "target": "defense", "weight": 22, "copy": "You make defence the whole summer mission. Footwork, film and a painful number of closeout drills turn you into a bigger problem on that end. Next season's Defence spinner gets a training boost."}, {"id": "training_cancun", "label": "Focus on Cancun", "wheelLabel": "Cancun", "target": "all", "negativeAll": true, "weight": 12, "copy": "Cancun wins the offseason. The workouts are light, the beach clubs are loud, and training camp arrives a little too quickly. Next season's Points, Rebounds, Assists and Defence spinners each take a negative training hit."}];

const allHeightInches = [
  69, 70, 71, 72, 73, 74, 75, 76, 77, 78,
  79, 80, 81, 82, 83, 84, 85, 86, 87, 88
];

const heightWeightByPosition = {
  pos_pg: {
    ideal: { min: 73, max: 76 },
    ok: { min: 71, max: 78 },
    rareTallFrom: 82,
  },
  pos_sg: {
    ideal: { min: 76, max: 79 },
    ok: { min: 74, max: 81 },
    rareTallFrom: 84,
  },
  pos_sf: {
    ideal: { min: 78, max: 81 },
    ok: { min: 76, max: 83 },
    rareTallFrom: 86,
  },
  pos_pf: {
    ideal: { min: 80, max: 83 },
    ok: { min: 78, max: 85 },
    rareTallFrom: 87,
  },
  pos_c: {
    ideal: { min: 82, max: 85 },
    ok: { min: 80, max: 87 },
    rareTallFrom: 89,
  },
};

const collegePools = {
  blueBlood: [
    "Duke", "UConn", "Arizona", "Purdue", "Iowa", "Illinois", "Michigan", "Tennessee",
    "Kentucky", "Kansas", "North Carolina", "UCLA", "Indiana", "Louisville",
    "Michigan State", "Villanova", "Gonzaga", "Syracuse", "Florida", "Arkansas"
  ],
  power: [
    "Baylor", "Houston", "Alabama", "Texas", "Texas Tech", "Auburn", "Oregon", "USC",
    "Maryland", "Ohio State", "Wisconsin", "Virginia", "Creighton", "Marquette",
    "Missouri", "Clemson", "Nebraska", "Vanderbilt"
  ],
  midMajor: [
    "San Diego State", "Saint Mary's", "Memphis", "VCU", "Dayton", "Wichita State",
    "Loyola Chicago", "Nevada", "New Mexico", "Boise State", "Charleston", "Drake"
  ],
  lowMajor: [
    "Vermont", "Colgate", "South Dakota State", "UC Irvine", "Grand Canyon", "Montana",
    "Oakland", "Samford", "Northern Iowa", "Akron", "Iona", "Princeton"
  ],
  lastChance: [
    "Northwest Florida State", "Indian Hills CC", "South Plains College", "Hutchinson CC",
    "Chipola College", "Odessa College", "Salt Lake CC", "Kilgore College"
  ],
};

const poolSettings = {
  blueBlood: { label: "Blue Blood Offers", wheelLabel: "Blue", prestige: 30, draftStock: 12, mediaHype: 12 },
  power: { label: "Power Conference Offers", wheelLabel: "Power", prestige: 22, draftStock: 7, mediaHype: 7 },
  midMajor: { label: "Mid-Major Offers", wheelLabel: "Mid", prestige: 14, draftStock: 3, mediaHype: 3 },
  lowMajor: { label: "Low-Major Offers", wheelLabel: "Low", prestige: 8, draftStock: -1, mediaHype: 0 },
  lastChance: { label: "JUCO / Last Chance", wheelLabel: "JUCO", prestige: 4, draftStock: -6, mediaHype: -3 },
};

const stages = {
  position: {
    stageNumber: 1,
    name: "Position",
    shortName: "Position",
    description: "Set the role first. Pick it yourself or let the wheel decide your build.",
    actionLabel: "Spin Position",
    mode: "pick-or-spin",
    options: [
      { id: "pos_pg", label: "Point Guard", wheelLabel: "PG", weight: 2, copy: "You are running the offence. Ball in hand, board pressure on." },
      { id: "pos_sg", label: "Shooting Guard", wheelLabel: "SG", weight: 2, copy: "Scoring profile locked. The file starts with buckets." },
      { id: "pos_sf", label: "Small Forward", wheelLabel: "SF", weight: 2, copy: "Wing profile locked. Versatility is the calling card." },
      { id: "pos_pf", label: "Power Forward", wheelLabel: "PF", weight: 2, copy: "Forward build locked. Size, force, and matchup problems." },
      { id: "pos_c", label: "Centre", wheelLabel: "C", weight: 2, copy: "Big man profile locked. The paint now has a name on it." },
    ],
  },
  height: {
    stageNumber: 2,
    name: "Height",
    shortName: "Height",
    description: "Measurements are in. Every height is possible, but your position changes the board.",
    actionLabel: "Spin Height",
    mode: "spin",
    options: [],
  },
  wingspan: {
    stageNumber: 3,
    name: "Wingspan",
    shortName: "Wingspan",
    description: "Reach changes everything. Spin the measurement report.",
    actionLabel: "Spin Wingspan",
    mode: "spin",
    options: [
      { id: "wing_short", label: "Short reach", wheelLabel: "Short", minExtra: -2, maxExtra: 0, weight: 1, effects: { draftStock: -2 } },
      { id: "wing_standard", label: "Standard reach", wheelLabel: "Standard", minExtra: 1, maxExtra: 3, weight: 4, effects: { draftStock: 1 } },
      { id: "wing_plus", label: "Plus wingspan", wheelLabel: "+Span", minExtra: 4, maxExtra: 7, weight: 3, effects: { draftStock: 4, collegePerformance: 2 } },
      { id: "wing_elite", label: "Elite wingspan", wheelLabel: "Elite", minExtra: 8, maxExtra: 12, weight: 1, effects: { draftStock: 8, mediaHype: 4, collegePerformance: 3 } },
    ],
  },
  seniorNight: {
    stageNumber: 4,
    name: "High School Senior Night",
    shortName: "Senior Night",
    description: "One final high school box score before recruitment opens up.",
    actionLabel: "Spin Senior Night",
    mode: "spin",
    options: [
      { id: "hs_solid", label: "Solid all-round game", wheelLabel: "18 / 6 / 5", points: 18, rebounds: 6, assists: 5, weight: 4, copy: "Clean, composed, and hard to pick apart. Scouts leave with notes, not doubts.", effects: { draftStock: 8, mediaHype: 5, collegePerformance: 4 } },
      { id: "hs_scorer", label: "Big scoring night", wheelLabel: "32 / 5 / 3", points: 32, rebounds: 5, assists: 3, weight: 3, copy: "You carry the offence and put your scoring package on tape.", effects: { draftStock: 15, mediaHype: 10, collegePerformance: 8 } },
      { id: "hs_playmaker", label: "Floor general masterclass", wheelLabel: "16 / 4 / 12", points: 16, rebounds: 4, assists: 12, weight: 2, copy: "The box score says passing clinic. The film says control.", effects: { draftStock: 12, mediaHype: 7, collegePerformance: 6 } },
      { id: "hs_glass", label: "Dominant on the boards", wheelLabel: "20 / 15 / 2", points: 20, rebounds: 15, assists: 2, weight: 2, copy: "You win the possession battle and bully the glass all night.", effects: { draftStock: 10, mediaHype: 5, collegePerformance: 5 } },
      { id: "hs_rough", label: "Rough final game", wheelLabel: "9 / 4 / 2", points: 9, rebounds: 4, assists: 2, weight: 2, copy: "The pressure shows. Not fatal, but the questions get louder.", effects: { draftStock: -8, mediaHype: -5, collegePerformance: -6 } },
      { id: "hs_legend", label: "Legendary senior night", wheelLabel: "45 / 11 / 12", points: 45, rebounds: 11, assists: 12, weight: 1, copy: "A ridiculous final act. The group chat clips are already moving.", effects: { draftStock: 25, mediaHype: 20, collegePerformance: 15 } },
    ],
  },
  collegeRecruitment: {
    stageNumber: 5,
    name: "College Recruitment",
    shortName: "Recruitment",
    description: "Recruiting boards open. Your high school tape decides what level of programs are calling.",
    actionLabel: "Spin Recruitment",
    mode: "spin",
    options: [
      { id: "recruit_blue_blood", label: "Blue Blood Offers", wheelLabel: "Blue", pool: "blueBlood", weight: 1, copy: "The biggest college programs in the country are on the phone." },
      { id: "recruit_power", label: "Power Conference Offers", wheelLabel: "Power", pool: "power", weight: 3, copy: "Major programs see a serious high-upside player." },
      { id: "recruit_mid", label: "Mid-Major Offers", wheelLabel: "Mid", pool: "midMajor", weight: 4, copy: "Good programs are calling, but the path to the NBA will need production." },
      { id: "recruit_low", label: "Low-Major Offers", wheelLabel: "Low", pool: "lowMajor", weight: 2, copy: "The offers are real, but the spotlight is smaller." },
      { id: "recruit_last_path", label: "JUCO / Last Chance", wheelLabel: "JUCO", pool: "lastChance", weight: 1, copy: "The route is harder now. Nothing is promised." },
    ],
  },
  collegeSelection: {
    stageNumber: 6,
    name: "College Selection",
    shortName: "College",
    description: "Your recruitment result changes the board, but every college outcome remains possible.",
    actionLabel: "Spin College",
    mode: "spin",
    options: [],
  },
  freshmanYear: {
    stageNumber: 7,
    name: "Freshman Year",
    shortName: "Freshman",
    description: "First year on campus. One season can change the entire board.",
    actionLabel: "Spin Freshman Year",
    mode: "spin",
    options: [
      { id: "freshman_all_american", label: "Freshman All-American", wheelLabel: "All-Am", weight: 1, copy: "You look like a pro from day one. NBA scouts are already circling.", effects: { draftStock: 26, collegePerformance: 22, mediaHype: 20 } },
      { id: "freshman_starter", label: "Day-One Starter", wheelLabel: "Starter", weight: 3, copy: "You earn real minutes immediately and hold up under pressure.", effects: { draftStock: 12, collegePerformance: 12, mediaHype: 6 } },
      { id: "freshman_role", label: "Solid Rotation Freshman", wheelLabel: "Rotation", weight: 4, copy: "The role is useful, not flashy. Development is on track.", effects: { draftStock: 4, collegePerformance: 6 } },
      { id: "freshman_bench", label: "Bench Learning Year", wheelLabel: "Bench", weight: 2, copy: "You spend more time learning than starring. The long game starts now.", effects: { draftStock: -8, collegePerformance: -4, mediaHype: -4 } },
      { id: "freshman_march", label: "March Madness Moment", wheelLabel: "March", weight: 2, copy: "One big tournament moment puts your name in every draft chat.", effects: { draftStock: 15, collegePerformance: 10, mediaHype: 16 } },
      { id: "freshman_declare", label: "Declare For Draft", wheelLabel: "Declare", weight: 0.8, copy: "You cash in early. One-and-done is official, and the draft process starts now.", effects: { draftStock: 18, mediaHype: 15 }, declareForDraft: true },
    ],
  },
  sophomoreYear: {
    stageNumber: 8,
    name: "Sophomore Year",
    shortName: "Sophomore",
    description: "Second year. Break out, plateau, or take the early leap.",
    actionLabel: "Spin Sophomore Year",
    mode: "spin",
    options: [
      { id: "sophomore_breakout", label: "Sophomore Breakout", wheelLabel: "Breakout", weight: 2, copy: "The leap is obvious. You go from prospect to problem.", effects: { draftStock: 20, collegePerformance: 18, mediaHype: 14 } },
      { id: "sophomore_all_conference", label: "All-Conference Season", wheelLabel: "All-Conf", weight: 2, copy: "Production, role, respect. Your résumé is getting strong.", effects: { draftStock: 16, collegePerformance: 15, mediaHype: 8 } },
      { id: "sophomore_plateau", label: "Production Plateaus", wheelLabel: "Plateau", weight: 3, copy: "Teams still like you, but the ceiling conversation gets quieter.", effects: { draftStock: -5, collegePerformance: 2, mediaHype: -5 } },
      { id: "sophomore_slump", label: "Sophomore Slump", wheelLabel: "Slump", weight: 2, copy: "The numbers dip and the board cools off.", effects: { draftStock: -14, collegePerformance: -10, mediaHype: -8 } },
      { id: "sophomore_tourney", label: "Tournament Run", wheelLabel: "Run", weight: 2, copy: "You show up when the country is watching.", effects: { draftStock: 12, collegePerformance: 10, mediaHype: 12 } },
      { id: "sophomore_declare", label: "Declare For Draft", wheelLabel: "Declare", weight: 1.5, copy: "You decide the college sample is enough. The draft process starts now.", effects: { draftStock: 10, mediaHype: 8 }, declareForDraft: true },
      { id: "sophomore_career_injury", label: "Career Ending Injury", wheelLabel: "Injury", weight: 0.15, copy: "A devastating injury ends the playing career before the draft dream arrives.", effects: { medicalRisk: 100, draftStock: -100 }, endsCareer: true },
    ],
  },
  juniorYear: {
    stageNumber: 9,
    name: "Junior Year",
    shortName: "Junior",
    description: "Now the profile is clearer. Teams want proof, polish, or a reason to believe.",
    actionLabel: "Spin Junior Year",
    mode: "spin",
    options: [
      { id: "junior_star", label: "Established College Star", wheelLabel: "Star", weight: 2, copy: "You are now the name opponents build the scout around.", effects: { draftStock: 18, collegePerformance: 18, mediaHype: 12 } },
      { id: "junior_breakout", label: "National Breakout", wheelLabel: "National", weight: 1.5, copy: "The whole country catches up. Draft boards move quickly.", effects: { draftStock: 24, collegePerformance: 22, mediaHype: 20 } },
      { id: "junior_growth", label: "Steady Growth", wheelLabel: "Growth", weight: 3, copy: "Nothing viral, but the improvement is real.", effects: { draftStock: 8, collegePerformance: 10, mediaHype: 3 } },
      { id: "junior_role_change", label: "Role Change Hurts Stock", wheelLabel: "Role Hit", weight: 2, copy: "A new role makes the evaluation harder. Some teams cool off.", effects: { draftStock: -12, collegePerformance: -6, mediaHype: -6 } },
      { id: "junior_declare", label: "Declare For Draft", wheelLabel: "Declare", weight: 3, copy: "You enter the draft with enough college tape to be taken seriously.", effects: { draftStock: 6, mediaHype: 6 }, declareForDraft: true },
      { id: "junior_career_injury", label: "Career Ending Injury", wheelLabel: "Injury", weight: 0.15, copy: "A devastating injury ends the playing career before the draft dream arrives.", effects: { medicalRisk: 100, draftStock: -100 }, endsCareer: true },
    ],
  },
  seniorYear: {
    stageNumber: 10,
    name: "Senior Year",
    shortName: "Senior",
    description: "Final college season. A last path to build, hold, or lose draft value.",
    actionLabel: "Spin Senior Year",
    mode: "spin",
    options: [
      { id: "senior_poy", label: "National Player of the Year Buzz", wheelLabel: "POY", weight: 1, copy: "Your final season becomes a headline campaign.", effects: { draftStock: 24, collegePerformance: 24, mediaHype: 22 } },
      { id: "senior_leader", label: "Senior Leader Season", wheelLabel: "Leader", weight: 3, copy: "Teams love the maturity and the production.", effects: { draftStock: 12, collegePerformance: 15, mediaHype: 8 } },
      { id: "senior_solid", label: "Solid Senior Year", wheelLabel: "Solid", weight: 4, copy: "The file is steady. You look like a pro, even if not a star.", effects: { draftStock: 5, collegePerformance: 8, mediaHype: 2 } },
      { id: "senior_dip", label: "Stock Dips Late", wheelLabel: "Dip", weight: 2, copy: "The senior year does not answer enough questions.", effects: { draftStock: -12, collegePerformance: -8, mediaHype: -6 } },
      { id: "senior_tourney_hero", label: "Tournament Hero", wheelLabel: "Hero", weight: 2, copy: "The tournament run changes the entire feel of the résumé.", effects: { draftStock: 16, collegePerformance: 14, mediaHype: 18 } },
      { id: "senior_career_injury", label: "Career Ending Injury", wheelLabel: "Injury", weight: 0.15, copy: "A devastating injury ends the playing career before the draft dream arrives.", effects: { medicalRisk: 100, draftStock: -100 }, endsCareer: true },
    ],
  },
  combine: {
    stageNumber: 11,
    name: "Draft Combine Performance",
    shortName: "Combine",
    description: "Testing, shooting, interviews, medicals. The cleanest way to rise or slide.",
    actionLabel: "Spin Combine",
    mode: "spin",
    options: [
      { id: "combine_average", label: "Average combine", wheelLabel: "Average", weight: 4, athletic: "Average", shooting: "Average", interview: "Fine", medical: "Clear", copy: "No panic. No explosion either. You test about where teams expected.", effects: { combineBoost: 0 } },
      { id: "combine_athlete", label: "Elite athletic testing", wheelLabel: "Athlete", weight: 2, athletic: "Elite", shooting: "Average", interview: "Fine", medical: "Clear", copy: "The numbers pop. Teams start asking what the ceiling could be.", effects: { combineBoost: 15, draftStock: 10, mediaHype: 6 } },
      { id: "combine_shooter", label: "Lights-out shooting drill", wheelLabel: "Shooter", weight: 2, athletic: "Average", shooting: "Elite", interview: "Fine", medical: "Clear", copy: "Workout gym whispers start immediately. The jumper travelled.", effects: { combineBoost: 14, draftStock: 10, mediaHype: 7 } },
      { id: "combine_leader", label: "Excellent interviews", wheelLabel: "Interview", weight: 2, athletic: "Average", shooting: "Average", interview: "Excellent", medical: "Clear", copy: "Front offices like the person as much as the player.", effects: { combineBoost: 8, roleReadiness: 10, draftStock: 5 } },
      { id: "combine_medical", label: "Medical concern", wheelLabel: "Medical", weight: 1, athletic: "Average", shooting: "Average", interview: "Fine", medical: "Concern", copy: "A medical flag creates late uncertainty. The board gets nervous.", effects: { medicalRisk: 40, draftStock: -18, combineBoost: -8 } },
      { id: "combine_star", label: "Star-making combine", wheelLabel: "Star", weight: 1, athletic: "Elite", shooting: "Elite", interview: "Excellent", medical: "Clear", copy: "This is the headline outcome. Every team wants another look.", effects: { combineBoost: 30, draftStock: 18, mediaHype: 20, roleReadiness: 10 } },
    ],
  },
  mockDraft: {
    stageNumber: 12,
    name: "Mock Draft Position",
    shortName: "Mock Draft",
    description: "The media board updates. This is not the draft, but it changes the noise around you.",
    actionLabel: "Spin Mock Draft",
    mode: "spin",
    options: [
      { id: "mock_top3", label: "Top 3 Pick", wheelLabel: "Top 3", pickRange: "1-3", weight: 1, copy: "Franchise-changing buzz. You are near the very top of the board.", effects: { mediaHype: 10, draftStock: 8 } },
      { id: "mock_lottery", label: "Lottery Pick", wheelLabel: "Lottery", pickRange: "4-14", weight: 3, copy: "Firm lottery range. Expectations are now very real.", effects: { mediaHype: 7, draftStock: 5 } },
      { id: "mock_mid_first", label: "Mid First Round", wheelLabel: "Mid 1st", pickRange: "15-22", weight: 4, copy: "Safe first-round territory. Teams see a real NBA player.", effects: { draftStock: 2 } },
      { id: "mock_late_first", label: "Late First Round", wheelLabel: "Late 1st", pickRange: "23-30", weight: 3, copy: "Back end of the first. Still strong, but there is work to do.", effects: { draftStock: -2 } },
      { id: "mock_second", label: "Second Round", wheelLabel: "2nd", pickRange: "31-58", weight: 2, copy: "Second-round range. The underdog storyline is forming.", effects: { draftStock: -7, mediaHype: -3 } },
      { id: "mock_undrafted", label: "Undrafted Watch", wheelLabel: "Watch", pickRange: "Undrafted", weight: 1, copy: "The board goes cold. You need a team to believe.", effects: { draftStock: -15, mediaHype: -8 } },
    ],
  },
  draftLottery: {
    stageNumber: 13,
    name: "Draft Lottery",
    shortName: "Lottery",
    description: "A little chaos before the podium. The order can help, hurt, or create a wildcard fit.",
    actionLabel: "Spin Draft Lottery",
    mode: "spin",
    options: [
      { id: "lot_team_jumps", label: "A team jumps up for you", wheelLabel: "Jump", movement: "Up", weight: 2, copy: "The board breaks your way. A team with interest now has room to move.", effects: { draftStock: 5, mediaHype: 4 } },
      { id: "lot_order_holds", label: "Board holds steady", wheelLabel: "Holds", movement: "No Change", weight: 5, copy: "No major shock. The draft room keeps working off the expected board." },
      { id: "lot_team_falls", label: "Your best-fit team falls", wheelLabel: "Falls", movement: "Down", weight: 2, copy: "Your cleanest landing spot slips away. The range gets messy.", effects: { draftStock: -4 } },
      { id: "lot_trade_buzz", label: "Trade buzz around your pick", wheelLabel: "Trade", movement: "Trade", weight: 1, copy: "Rumours start flying. Someone may be trying to move up.", effects: { mediaHype: 4 } },
    ],
  },
  drafted: {
    stageNumber: 13,
    name: "Drafted",
    shortName: "Drafted",
    description: "Final spin. One board, one pick range, one beginning.",
    actionLabel: "Spin Draft Result",
    mode: "spin",
    options: [
      { id: "drafted_1", label: "Number 1 Pick", wheelLabel: "#1", pickRange: "1", weight: 0.5, copy: "You are selected as the face of the draft." },
      { id: "drafted_2", label: "Number 2 Pick", wheelLabel: "#2", pickRange: "2", weight: 1, copy: "Second off the board. The league rivalry starts early." },
      { id: "drafted_3", label: "Number 3 Pick", wheelLabel: "#3", pickRange: "3", weight: 2, copy: "Top 3. Superstar comparisons are already being made." },
      { id: "drafted_4", label: "Number 4 Pick", wheelLabel: "#4", pickRange: "4", weight: 3, copy: "Top 4 is a massive result - now prove you belong." },
      { id: "drafted_5", label: "Number 5 Pick", wheelLabel: "#5", pickRange: "5", weight: 4, copy: "Top 5 in the draft - a dream start to your career." },
      { id: "drafted_top_10", label: "Top 10 Pick", wheelLabel: "Top 10", pickRange: "6-10", weight: 8, copy: "Top 10 shows your class. The runway is real." },
      { id: "drafted_lottery", label: "Back End Lottery Pick", wheelLabel: "Lottery", pickRange: "11-14", weight: 12, copy: "You are a lottery pick. Expectations are high." },
      { id: "drafted_late_first", label: "Back End 1st Round Pick", wheelLabel: "Late 1st", pickRange: "15-30", weight: 24, copy: "You slid a little. Perfect place to make teams regret it." },
      { id: "drafted_second_round", label: "2nd Round Pick", wheelLabel: "2nd", pickRange: "31-60", weight: 12, copy: "A team took the flyer. Now the chip on the shoulder gets useful." },
      { id: "drafted_undrafted", label: "Undrafted", wheelLabel: "UDFA", pickRange: "Undrafted", weight: 5, copy: "Nothing is guaranteed now. You will have to fight for everything." },
    ],
  },
};


const careerStageIds = new Set([
  "career_points",
  "career_rebounds",
  "career_assists",
  "career_defense",
  "career_playoffs_entry",
  "career_playin",
  "career_playoff_round",
  "career_finals_game",
  "career_awards",
  "career_endseason",
  "career_movement",
  "career_offcourt",
  "career_training",
  "career_comeback",
  "career_team_spin",
]);


function createIncrementOptions(prefix, suffix, min, max, step, neutral, scale, decimals = 1) {
  const options = [];
  let index = 0;

  for (let value = min; value <= max + 0.0001; value += step) {
    const rounded = Number(value.toFixed(decimals));
    const labelValue = rounded.toFixed(decimals);
    const distance = Math.abs(rounded - neutral);
    const base = Math.max(0.04, 10 * Math.exp(-distance / scale));

    options.push({
      id: `${prefix}_${index}`,
      label: `${labelValue} ${suffix}`,
      wheelLabel: labelValue,
      value: rounded,
      impact: rounded,
      base: Number(base.toFixed(3)),
    });

    index += 1;
  }

  return options;
}


const statOptions = {
  points: createIncrementOptions("ppg", "PPG", 0, 50, 0.5, 13.5, 9, 1),
  rebounds: createIncrementOptions("rpg", "RPG", 0, 25, 0.5, 5.5, 5.2, 1),
  assists: createIncrementOptions("apg", "APG", 0, 25, 0.5, 3.8, 4.8, 1),
  defense: [
    { id: "def_negative", label: "Negative Defender", wheelLabel: "Negative", impact: -10, base: 1.5 },
    { id: "def_poor", label: "Poor Defender", wheelLabel: "Poor", impact: -2, base: 3 },
    { id: "def_average", label: "Average Defender", wheelLabel: "Average", impact: 5, base: 7 },
    { id: "def_strong", label: "Strong Defender", wheelLabel: "Strong", impact: 12, base: 5 },
    { id: "def_elite", label: "Elite Defender", wheelLabel: "Elite", impact: 22, base: 1.8 },
    { id: "def_generational", label: "Generational Defender", wheelLabel: "Generational", impact: 30, base: 0.45 },
  ],
};

const elements = {
  playerNameInput: document.getElementById("playerNameInput"),
  skipEndButton: document.getElementById("skipEndButton"),
  resetButton: document.getElementById("resetButton"),
  copyButton: document.getElementById("copyButton"),
  progressSteps: document.getElementById("progressSteps"),
  summaryList: document.getElementById("summaryList"),
  stageContent: document.getElementById("stageContent"),
  journeyLog: document.getElementById("journeyLog"),
  resultModal: document.getElementById("resultModal"),
  injuryModal: document.getElementById("injuryModal"),
  injuryModalTitle: document.getElementById("injuryModalTitle"),
  injuryModalCopy: document.getElementById("injuryModalCopy"),
  injuryContinueButton: document.getElementById("injuryContinueButton"),
  closeModalButton: document.getElementById("closeModalButton"),
  continueButton: document.getElementById("continueButton"),
  bonusReSpinButton: document.getElementById("bonusReSpinButton"),
  modalKicker: document.getElementById("modalKicker"),
  modalTitle: document.getElementById("modalTitle"),
  modalCopy: document.getElementById("modalCopy"),
  modalPills: document.getElementById("modalPills"),
  finalModal: document.getElementById("finalModal"),
  closeFinalModalButton: document.getElementById("closeFinalModalButton"),
  finalModalKicker: document.getElementById("finalModalKicker"),
  finalModalTitle: document.getElementById("finalModalTitle"),
  finalProspectCard: document.getElementById("finalProspectCard"),
  downloadImageButton: document.getElementById("downloadImageButton"),
  shareImageButton: document.getElementById("shareImageButton"),
  copyFinalButton: document.getElementById("copyFinalButton"),
  restartFinalButton: document.getElementById("restartFinalButton"),
  boostInfoModal: document.getElementById("boostInfoModal"),
  boostInfoOkButton: document.getElementById("boostInfoOkButton"),
};

let state = loadState() || createInitialState();
let wheelInstance = null;
let activeStageId = null;
let activeOptions = [];
let activeWheelItems = [];
let selectedSpin = null;
let isSpinning = false;
let spinTimeout = null;
let pendingPositionBoostInfoModal = false;
let forceSpinBoostInfoAfterResult = false;

function createInitialCareerState() {
  return {
    started: false,
    completed: false,
    maxSeasons: 20,
    seasonNumber: 1,
    currentStage: null,
    currentTeam: null,
    originalTeam: null,
    lastSignedTeam: null,
    teams: [],
    seasons: [],
    movementHistory: [],
    comebackHistory: [],
    offCourtHistory: [],
    offCourtUsedIds: [],
    nextSeasonTrainingFocus: null,
    forcedTrainingFocus: null,
    rating: null,
    pendingSeason: null,
    pendingAdvanceStage: null,
    nextSeasonStatShift: 0,
    nextSeasonRiskShift: 0,
    legacyBoost: 0,
    playoffStats: {
      championships: 0,
      finalsAppearances: 0,
      conferenceFinals: 0,
      playoffAppearances: 0,
      finalsGameWins: 0,
      finalsGameLosses: 0,
      bestFinish: "None",
    },
    awards: {
      roy: 0,
      mvp: 0,
      allNbaFirst: 0,
      allNba: 0,
      allStar: 0,
      scoringTitle: 0,
      dpoy: 0,
    },
    legacy: null,
    endingReason: null,
  };
}






function createPendingSeason(seasonNumber) {
  const offCourtStatShift = Number(state.career?.nextSeasonStatShift || 0);
  const offCourtRiskShift = Number(state.career?.nextSeasonRiskShift || 0);
  const trainingFocus = state.career?.nextSeasonTrainingFocus || null;

  if (state.career) {
    state.career.nextSeasonStatShift = 0;
    state.career.nextSeasonRiskShift = 0;
    state.career.nextSeasonTrainingFocus = null;
  }

  return {
    season: seasonNumber,
    team: state.career?.currentTeam || "Unsigned",
    ppg: null,
    rpg: null,
    apg: null,
    defense: null,
    defenseImpact: 0,
    resultTier: null,
    score: 0,
    awards: [],
    teamPerformance: null,
    playoffs: null,
    comebackTag: null,
    waiverResolved: false,
    offCourtStatShift,
    offCourtRiskShift,
    trainingFocus,
  };
}




function createInitialState() {
  return {
    playerName: "",
    results: {},
    log: [],
    completed: false,
    endingType: null,
    bonus: {
      count: 3,
      active: false,
      activeStageId: null,
      earnedLog: [],
      introShown: false,
    },
    flags: {
      declareStage: null,
    },
    profile: {
      draftStock: 50,
      collegePrestige: 0,
      collegePerformance: 0,
      mediaHype: 0,
      medicalRisk: 0,
      combineBoost: 0,
      roleReadiness: 0,
    },
    career: createInitialCareerState(),
  };
}



function normaliseState(saved) {
  const fresh = createInitialState();
  const career = { ...fresh.career, ...(saved.career || {}) };
  career.awards = { ...fresh.career.awards, ...(saved.career?.awards || {}) };
  career.playoffStats = { ...fresh.career.playoffStats, ...(saved.career?.playoffStats || {}) };
  career.offCourtUsedIds = Array.isArray(career.offCourtUsedIds) ? career.offCourtUsedIds : [];
  career.offCourtHistory = Array.isArray(career.offCourtHistory) ? career.offCourtHistory : [];
  career.nextSeasonTrainingFocus = career.nextSeasonTrainingFocus || null;
  career.forcedTrainingFocus = career.forcedTrainingFocus || null;
  career.rating = career.rating || null;
  career.originalTeam = career.originalTeam || (saved.results?.drafted?.team || null);
  career.lastSignedTeam = career.lastSignedTeam || (career.currentTeam && career.currentTeam !== "Unsigned" ? career.currentTeam : null) || career.originalTeam || null;
  career.originalTeam = career.originalTeam || (saved.results?.drafted?.pickRange !== "Undrafted" ? saved.results?.drafted?.team : null) || null;
  career.lastSignedTeam = career.lastSignedTeam || (career.currentTeam && career.currentTeam !== "Unsigned" ? career.currentTeam : null) || career.originalTeam || null;
  return {
    ...fresh,
    ...saved,
    bonus: { ...fresh.bonus, ...(saved.bonus || {}) },
    flags: { ...fresh.flags, ...(saved.flags || {}) },
    profile: { ...fresh.profile, ...(saved.profile || {}) },
    career,
    results: saved.results || {},
    log: saved.log || [],
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normaliseState(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentStageId() {
  if (state.completed) return null;

  for (const stageId of stageOrder) {
    if (state.results[stageId]) continue;
    if (shouldSkipStage(stageId)) continue;
    return stageId;
  }

  if (state.career.started && !state.career.completed) {
    if (state.career.currentStage === "career_legacy") {
      completeCareerWithCalculatedLegacy();
      saveState();
      return null;
    }

    return state.career.currentStage || "career_points";
  }

  return null;
}



function shouldSkipStage(stageId) {
  const declaredAt = state.flags.declareStage;
  if (!declaredAt) return false;

  const declaredIndex = collegeYearStages.indexOf(declaredAt);
  const stageIndex = collegeYearStages.indexOf(stageId);

  return declaredIndex >= 0 && stageIndex > declaredIndex;
}

function getSkippedLabel(stageId) {
  return shouldSkipStage(stageId) ? "Skipped - Declared" : "";
}

function getStageDefinition(stageId) {
  const season = state.career.seasonNumber;
  const team = state.career.currentTeam || "Unsigned";
  const currentSeason = getCurrentSeasonRecord();
  const playoffRound = currentSeason?.playoffs?.currentRound || "First Round";
  const finalsGame = currentSeason?.playoffs?.finalsGame || 1;

  const careerDefinitions = {
    career_points: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Points Per Game`,
      shortName: `S${season} PPG`,
      description: `First stat spin of the season. Career events, retirement and waived outcomes can appear here. Team: ${team}.`,
      actionLabel: "Spin Points",
      mode: "spin",
    },
    career_rebounds: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Rebounds Per Game`,
      shortName: `S${season} RPG`,
      description: "Rebounds are shaped by position, build and career momentum.",
      actionLabel: "Spin Rebounds",
      mode: "spin",
    },
    career_assists: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Assists Per Game`,
      shortName: `S${season} APG`,
      description: "Assists are shaped by position and play style, but outlier seasons remain possible.",
      actionLabel: "Spin Assists",
      mode: "spin",
    },
    career_defense: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Defence / Impact`,
      shortName: `S${season} Defence`,
      description: "This final stat spin completes the individual season and sends you into team performance.",
      actionLabel: "Spin Defence",
      mode: "spin",
    },
    career_playoffs_entry: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Playoffs?`,
      shortName: `S${season} Playoffs?`,
      description: "Team performance starts here. Your in-season performance shapes the playoff path.",
      actionLabel: "Spin Playoffs",
      mode: "spin",
    },
    career_playin: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Play-In`,
      shortName: `S${season} Play-In`,
      description: "The play-in decides whether the season keeps going or ends before the first round.",
      actionLabel: "Spin Play-In",
      mode: "spin",
    },
    career_playoff_round: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - ${playoffRound}`,
      shortName: playoffRound,
      description: "Each playoff round is a two-outcome spin: advance or be eliminated.",
      actionLabel: "Spin Round",
      mode: "spin",
    },
    career_finals_game: {
      stageNumber: `NBA ${season}`,
      name: `NBA Finals - Game ${finalsGame}`,
      shortName: `Finals G${finalsGame}`,
      description: "Play out the Finals one game at a time. First to four wins takes the championship.",
      actionLabel: "Spin Game",
      mode: "spin",
    },
    career_awards: {
      stageNumber: `NBA ${season}`,
      name: getCurrentAwardCheck()?.stageName || `Season ${season} - Awards`,
      shortName: getCurrentAwardCheck()?.shortName || `S${season} Awards`,
      description: getCurrentAwardCheck()?.description || "Awards are checked one-by-one based on the season résumé.",
      actionLabel: "Spin Award",
      mode: "spin",
    },
    career_endseason: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - End of Season Decision`,
      shortName: `S${season} Decision`,
      description: "After awards, the team decides whether your roster spot is safe or whether you are waived.",
      actionLabel: "Spin Decision",
      mode: "spin",
    },
    career_movement: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Team Movement`,
      shortName: `S${season} Movement`,
      description: "After the season, the career can continue with the same team, a trade, free agency or retirement.",
      actionLabel: "Spin Movement",
      mode: "spin",
    },
    career_offcourt: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Offseason Life Event`,
      shortName: `S${season} Offseason`,
      description: "Every second season, an offseason comedy spin can boost, hurt, or end the career. Landed events are removed for the rest of this career.",
      actionLabel: "Spin Life Event",
      mode: "spin",
    },
    career_training: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Training Focus`,
      shortName: `S${season} Training`,
      description: "Every offseason has a training focus. The result gives next season a targeted boost, unless Cancun wins the offseason.",
      actionLabel: "Spin Training",
      mode: "spin",
    },
    career_comeback: {
      stageNumber: `NBA ${season}`,
      name: `Season ${season} - Comeback Spin`,
      shortName: "Comeback",
      description: "Spin to see whether the player gets back to an NBA roster, heads overseas, stays in the G League, or retires.",
      actionLabel: "Spin Comeback",
      mode: "spin",
    },
    career_team_spin: {
      stageNumber: `NBA ${season}`,
      name: "NBA Team Spin",
      shortName: "Team Spin",
      description: "Spin to reveal which NBA team signs the player.",
      actionLabel: "Spin Team",
      mode: "team",
    },
  };

  return careerStageIds.has(stageId) ? careerDefinitions[stageId] : stages[stageId];
}




function getHeightOptionsForPosition() {
  const positionId = state.results.position?.id || "pos_sg";
  const profile = heightWeightByPosition[positionId] || heightWeightByPosition.pos_sg;

  return allHeightInches.map((inches) => {
    const label = inchesToHeight(inches);
    return {
      id: `height_${inches}`,
      label,
      wheelLabel: label,
      inches,
      weight: getHeightWeightForPosition(inches, profile),
      copy: `Official measurement: ${label}.`,
    };
  });
}

function getHeightWeightForPosition(inches, profile) {
  if (inches >= profile.ideal.min && inches <= profile.ideal.max) return 8;
  if (inches >= profile.ok.min && inches <= profile.ok.max) return 4;

  const distanceToOkRange = inches < profile.ok.min
    ? profile.ok.min - inches
    : inches - profile.ok.max;

  let weight = Math.max(0.25, 2.2 - distanceToOkRange * 0.55);

  if (inches <= 70 || inches >= 87) weight = Math.min(weight, 0.35);
  if (profile.rareTallFrom && inches >= profile.rareTallFrom) weight = Math.min(weight, 0.25);
  if (profile.ideal.min >= 80 && inches <= 74) weight = Math.min(weight, 0.25);

  return Math.max(0.1, Number(weight.toFixed(2)));
}

function getWheelClass() {
  return window.Wheel || window.spinWheel?.Wheel || window.SpinWheel?.Wheel || null;
}

function pickWeighted(options) {
  const totalWeight = options.reduce((sum, option) => sum + Number(option.weight || 0), 0);
  let random = Math.random() * totalWeight;

  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    random -= Number(option.weight || 0);
    if (random <= 0) return { option, index };
  }

  return { option: options[options.length - 1], index: options.length - 1 };
}

function randomInteger(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomTeam(excludeTeam = null) {
  const candidates = nbaTeams.filter((team) => team !== excludeTeam);
  return randomChoice(candidates.length ? candidates : nbaTeams);
}

function inchesToHeight(inches) {
  const feet = Math.floor(inches / 12);
  const inch = inches % 12;
  return `${feet}'${inch}"`;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function render() {
  elements.playerNameInput.value = state.playerName;
  setTeamTheme();
  renderProgress();
  renderSummary();
  renderStage();
  renderLog();
}


function setTeamTheme() {
  const team = getActiveTeamForDisplay();
  const themeMap = typeof teamThemes !== "undefined" ? teamThemes : {};
  const [primary, secondary] = themeMap[team] || ["#6c87a6", "#141d28"];
  const abbr = team && teamAbbreviations[team] ? teamAbbreviations[team] : "";

  document.body.style.setProperty("--team-primary", primary);
  document.body.style.setProperty("--team-secondary", secondary);
  document.body.style.setProperty("--team-bg-a", hexToRgba(primary, 0.42));
  document.body.style.setProperty("--team-bg-b", hexToRgba(secondary, 0.30));
  document.body.style.setProperty("--team-abbr", `"${abbr}"`);
}

function getActiveTeamForDisplay() {
  if (state.career?.started) {
    if (state.career.currentTeam && state.career.currentTeam !== "Unsigned") {
      return state.career.currentTeam;
    }

    if (state.career.lastSignedTeam) {
      return state.career.lastSignedTeam;
    }

    return null;
  }

  return state.results.drafted?.team || null;
}









function hexToRgba(hex, alpha) {
  const cleaned = String(hex).replace("#", "");
  const full = cleaned.length === 3
    ? cleaned.split("").map((char) => char + char).join("")
    : cleaned;

  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderProgress() {
  const currentStageId = getCurrentStageId();

  const baseSteps = stageOrder.map((stageId, index) => {
    const stage = stages[stageId];
    const complete = Boolean(state.results[stageId]);
    const skipped = shouldSkipStage(stageId);
    const active = stageId === currentStageId;
    const ended = state.completed && state.endingType === "injury" && complete;
    return `<div class="progress-step ${complete ? "complete" : ""} ${skipped ? "skipped" : ""} ${active ? "active" : ""} ${ended ? "ended" : ""}" data-number="${index + 1}">${escapeHtml(stage.shortName)}</div>`;
  });

  if (state.career.started) {
    const careerActive = careerStageIds.has(currentStageId);
    const careerLabel = state.career.completed ? "Career Complete" : `NBA S${state.career.seasonNumber}`;
    baseSteps.push(`<div class="progress-step ${state.career.completed ? "complete" : ""} ${careerActive ? "active" : ""}" data-number="15">${escapeHtml(careerLabel)}</div>`);
  }

  elements.progressSteps.innerHTML = baseSteps.join("");
}


function getBonusSummaryLine() {
  const earned = state.bonus?.earnedLog || [];
  if (!earned.length) return "Start with 3. Championship +3, MVP +2, Scoring Title or DPOY +1.";
  return earned.slice(0, 2).map((item) => `${item.amount > 0 ? "+" : ""}${item.amount} ${item.reason}`).join(" / ");
}




function getDefenseDisplayLabelFromImpact(value) {
  const score = Number(value || 0);
  if (score >= 24) return "Generational";
  if (score >= 18) return "Elite";
  if (score >= 10) return "Strong";
  if (score >= 2) return "Average";
  if (score >= -4) return "Poor";
  return "Negative";
}

function getPlayerFileDisplayStats(totals, rating) {
  const current = state.career?.pendingSeason || null;
  const defenseMap = {
    "Negative Defender": "Negative",
    "Poor Defender": "Poor",
    "Average Defender": "Average",
    "Strong Defender": "Strong",
    "Elite Defender": "Elite",
    "Generational Defender": "Generational",
  };

  if (totals.nbaSeasons) {
    return {
      ppg: totals.ppg,
      rpg: totals.rpg,
      apg: totals.apg,
      def: getDefenseDisplayLabelFromImpact(rating.avgDefense || 0),
    };
  }

  return {
    ppg: typeof current?.ppg === "number" ? current.ppg.toFixed(1) : "—",
    rpg: typeof current?.rpg === "number" ? current.rpg.toFixed(1) : "—",
    apg: typeof current?.apg === "number" ? current.apg.toFixed(1) : "—",
    def: current?.defense ? (defenseMap[current.defense] || current.defense) : "—",
  };
}





function renderSummary() {
  const totals = getCareerTotals();
  const rating = getCareerRatingBreakdownForDisplay();
  const awards = state.career?.awards || {};
  const playoff = state.career?.playoffStats || {};
  const currentTeam = getActiveTeamForDisplay();
  const position = state.results?.position?.summaryLabel || state.results?.position?.label || "—";
  const height = state.results?.height?.label || "—";
  const wingspan = state.results?.wingspan?.label || "—";
  const liveStats = getPlayerFileDisplayStats(totals, rating);

  const achievements = [
    { icon: "🏆", value: playoff.championships || 0, label: "Championships" },
    { icon: "🏅", value: awards.mvp || 0, label: "MVP" },
    { icon: "🥇", value: (awards.allNbaFirst || 0) + (awards.allNba || 0), label: "All-NBA Teams" },
    { icon: "⭐", value: awards.allStar || 0, label: "All-Star" },
    { icon: "🛡️", value: awards.dpoy || 0, label: "DPOY" },
    { icon: "🔥", value: awards.scoringTitle || 0, label: "Scoring Titles" },
  ];

  const bars = [
    ["Stats", rating.statsScore || 0, 30],
    ["Awards", rating.awardsScore || 0, 25],
    ["Winning", rating.teamScore || 0, 25],
    ["Longevity", rating.longevityScore || 0, 10],
  ];

  const recentSpins = state.log.slice(0, 5);

  elements.summaryList.innerHTML = `
    <section class="v50-subcard v50-player-summary-panel">
      <div class="v50-build-meta">
        <div class="v50-meta-item"><span>Position:</span><strong>${escapeHtml(position)}</strong></div>
        <div class="v50-meta-item"><span>HT:</span><strong>${escapeHtml(height)}</strong></div>
        <div class="v50-meta-item"><span>WS:</span><strong>${escapeHtml(wingspan)}</strong></div>
      </div>

      <div class="v50-current-team">
        <span>Current Team</span>
        ${renderTeamPill(currentTeam, "—")}
      </div>

      <div class="v50-stat-grid v50-stat-grid--with-defense">
        <div class="v50-stat"><strong>${escapeHtml(String(liveStats.ppg))}</strong><span>PPG</span></div>
        <div class="v50-stat"><strong>${escapeHtml(String(liveStats.rpg))}</strong><span>RPG</span></div>
        <div class="v50-stat"><strong>${escapeHtml(String(liveStats.apg))}</strong><span>APG</span></div>
        <div class="v50-stat v50-stat--full"><strong>${escapeHtml(String(liveStats.def))}</strong><span>DEF</span></div>
      </div>

      <div class="v50-mini-bars">
        ${bars.map(([label, value, max]) => `
          <div class="v50-mini-bar-row">
            <span>${escapeHtml(label)}</span>
            <div class="v50-mini-track">
              <i style="width:${escapeHtml(String(clamp((Number(value) / max) * 100, 0, 100)))}%"></i>
            </div>
            <b>${escapeHtml(`${Number(value || 0).toFixed(0)}/${max}`)}</b>
          </div>
        `).join("")}
      </div>

      <div class="v50-achievements-mini">
        ${achievements.map((item) => `
          <div class="v50-achievement">
            <em>${escapeHtml(item.icon)}</em>
            <div class="v50-achievement-copy">
              <strong>${escapeHtml(String(item.value))}</strong>
              <span>${escapeHtml(item.label)}</span>
            </div>
          </div>
        `).join("")}
      </div>
    </section>

${recentSpins.length ? `
    <section class="v50-subcard v50-spin-tracker-panel">
      <p class="v50-subcard-title">Spin Tracker</p>
      <div class="v50-spin-list">
        ${recentSpins.map((item) => `
          <div class="v50-spin-item" title="${escapeHtml(item.stageName)} - ${escapeHtml(item.title)}">
            <strong class="v50-spin-tracker-stage">${escapeHtml(item.stageName)}</strong>
            <span class="v50-spin-tracker-result">${escapeHtml(item.title)}</span>
          </div>
        `).join("")}
      </div>
    </section>` : ""}
  `;
}





function getBuildSummaryLine() {
  const position = state.results.position?.summaryLabel || state.results.position?.label;
  const height = state.results.height?.label;
  const wingspan = state.results.wingspan?.label;

  const main = [position, height].filter(Boolean).join(" / ") || "Pending";
  const sub = wingspan ? `${wingspan} wingspan` : "Measurements pending";

  return { main, sub };
}

function getCollegeSummaryLine() {
  const college = state.results.collegeSelection?.label || "College pending";
  const years = ["freshmanYear", "sophomoreYear", "juniorYear", "seniorYear"]
    .map((stageId) => state.results[stageId]?.label || getSkippedLabel(stageId))
    .filter(Boolean);

  return {
    main: college,
    sub: years.length ? years.join(" / ") : "College seasons pending",
  };
}

function getDraftSummaryLine() {
  const drafted = state.results.drafted;
  if (!drafted) return { main: "", sub: "" };

  return {
    main: drafted.team ? `${drafted.label} by ${drafted.team}` : `${drafted.label} - no team assigned`,
    sub: drafted.team || "Undrafted free agent path",
  };
}

function getLeftCareerSummaryLine() {
  const totals = getCareerTotals();
  const rings = state.career?.playoffStats?.championships || 0;

  if (!state.career?.started) {
    return {
      main: "Career not started",
      sub: "Draft result will start the NBA career path",
    };
  }

  return {
    main: `${totals.ppg} PPG / ${totals.rpg} RPG / ${totals.apg} APG`,
    sub: `${totals.nbaSeasons} counted seasons - ${rings} championship${rings === 1 ? "" : "s"}`,
  };
}



function getCurrentCareerStatusLine() {
  const currentStageId = getCurrentStageId();
  const currentStage = currentStageId ? getStageDefinition(currentStageId) : null;

  if (state.completed || state.career?.completed) {
    return {
      main: state.career?.legacy?.label || state.career?.endingReason || "Career Complete",
      sub: "Open the final career résumé",
    };
  }

  if (state.career?.started) {
    const team = state.career.currentTeam && state.career.currentTeam !== "Unsigned"
      ? state.career.currentTeam
      : "Free Agent";

    const detail = team === "Free Agent" && state.career.lastSignedTeam
      ? `Last team: ${state.career.lastSignedTeam}`
      : currentStage?.shortName || "Career stage";

    return {
      main: `Season ${state.career.seasonNumber}`,
      sub: `${team} - ${detail}`,
    };
  }

  return {
    main: currentStage?.shortName || "Pre-Draft",
    sub: currentStage?.name || "Build the player file",
  };
}





function getMiniSeasonValue() {
  if (!state.career?.started) return "—";
  if (state.completed || state.career?.completed) return "Done";
  return String(state.career.seasonNumber || 1);
}


function getBonusCount() {
  return Number(state.bonus?.count || 0);
}

function isBonusUnlocked() {
  return Boolean(state.bonus?.introShown || state.results?.position);
}

function isBonusEligible(stageId) {
  return isBonusUnlocked() && stageId !== "career_team_spin" && stageId !== "position";
}

function isBonusActiveForStage(stageId) {
  return Boolean(state.bonus?.active && state.bonus?.activeStageId === stageId && getBonusCount() > 0 && isBonusEligible(stageId));
}

function renderBonusControls(stageId) {
  if (!isBonusUnlocked() || stageId === "position") return "";
  const count = getBonusCount();
  const eligible = isBonusEligible(stageId);
  const active = isBonusActiveForStage(stageId);

  const buttonText = active ? "Boost Active" : "Use Boost";
  const disabled = !eligible || !count || active;

  return `
    <div class="bonus-panel ${active ? "active" : ""}">
      <div class="bonus-copy">
        <span class="bonus-title">⚡ ${escapeHtml(count)} Spin Boost${count === 1 ? "" : "s"} available</span>
      </div>
      <div class="bonus-actions">
        <button id="bonusInfoButton" class="bonus-info-button" type="button" aria-label="Spin boost info">i</button>
        <button id="bonusButton" class="bonus-button" ${disabled ? "disabled" : ""}>${escapeHtml(buttonText)}</button>
      </div>
    </div>
  `;
}



function getBonusHelpText(stageId, active) {
  if (!isBonusEligible(stageId)) return "Team spins are random, so spin boosts do not change this wheel.";
  if (active) return "Positive segments are boosted for this spin only.";
  if (!getBonusCount()) return "Earn more from championships, MVPs, scoring titles and DPOYs.";
  return "Boost this spin before it happens, or save one for a normal-board re-spin after a result.";
}

function activateBonusForStage(stageId) {
  if (!isBonusEligible(stageId) || !getBonusCount() || isSpinning) return;

  state.bonus.active = true;
  state.bonus.activeStageId = stageId;
  saveState();
  render();
  maybeShowSpinBoostInfo();
}

function clearBonusActive() {
  if (!state.bonus) return;
  state.bonus.active = false;
  state.bonus.activeStageId = null;
}

function addBonusSpin(reason, amount = 1) {
  const value = Number(amount || 1);
  state.bonus = state.bonus || { count: 0, active: false, activeStageId: null, earnedLog: [], introShown: true, infoSeen: true };
  state.bonus.count += value;
  state.bonus.earnedLog = state.bonus.earnedLog || [];
  state.bonus.earnedLog.unshift({
    reason,
    amount: value,
    season: state.career?.seasonNumber || null,
  });
}

function adjustSpinBoosts(amount, reason) {
  const value = Number(amount || 0);
  if (!value) return 0;

  state.bonus = state.bonus || { count: 0, active: false, activeStageId: null, earnedLog: [], introShown: true, infoSeen: true };
  const before = getBonusCount();
  state.bonus.count = Math.max(0, before + value);
  const actual = state.bonus.count - before;

  state.bonus.earnedLog = state.bonus.earnedLog || [];
  state.bonus.earnedLog.unshift({
    reason,
    amount: actual,
    season: state.career?.seasonNumber || null,
  });

  return actual;
}

function getAwardSpinBoostReward(type) {
  if (type === "mvp") return 2;
  if (type === "scoringTitle") return 1;
  if (type === "dpoy") return 1;
  return 0;
}

function formatSpinBoostReward(amount) {
  const value = Number(amount || 0);
  if (!value) return "";
  return ` +${value} Spin Boost${value === 1 ? "" : "s"} earned.`;
}



function renderStage() {
  destroyWheel();

  if (!state.playerName || !state.playerName.trim()) {
    renderNameEntry();
    return;
  }

  const stageId = getCurrentStageId();

  if (!stageId) {
    const injury = state.endingType === "injury" || state.endingType === "nba_injury";
    elements.stageContent.innerHTML = `
      <section class="v50-stage-complete">
        <p class="v50-kicker">${injury ? "Career Over" : "Career Complete"}</p>
        <h2>${injury ? "What Could Have Been" : "Final Résumé"}</h2>
        <p>${injury ? "The journey ended early. Open the career card or restart." : "The full career is complete. Open the final résumé card or restart."}</p>
        <div class="stage-complete-actions">
          <button id="viewFinalCardButton" class="spin-button">View Career Card</button>
          <button id="restartFromStageButton" class="outline-button">Restart Career</button>
        </div>
      </section>
    `;

    document.getElementById("viewFinalCardButton")?.addEventListener("click", showFinalProspectModal);
    document.getElementById("restartFromStageButton")?.addEventListener("click", resetState);
    return;
  }

  const stage = getStageDefinition(stageId);
  const options = getStageOptions(stageId);

  elements.stageContent.innerHTML = `
    <section class="v50-spin-stage">
      <div class="v50-stage-heading">
        <p class="v50-kicker">${careerStageIds.has(stageId) ? "Career Mode" : "Player Build"}</p>
        <h2>${escapeHtml(stage.name)}</h2>
        <p>${escapeHtml(stage.description)}</p>
      </div>

      <div class="wheel-zone">
        ${renderBonusControls(stageId)}
        <div class="wheel-shell">
          <div class="wheel-pointer" aria-hidden="true"></div>
          <div id="wheelContainer" class="wheel-container"></div>
          <div class="wheel-centre-cap" aria-hidden="true"></div>
        </div>
        <button id="spinButton" class="spin-button">${escapeHtml(stage.actionLabel)}</button>
        ${stage.mode === "pick-or-spin" ? buildChoicePanel(options) : ""}
      </div>

      ${renderLatestCard(stageId)}
    </section>
  `;

  activeStageId = stageId;
  activeOptions = options;
  createLibraryWheel(stage, options);

  document.getElementById("spinButton")?.addEventListener("click", () => spinStage(stageId));
  document.getElementById("bonusButton")?.addEventListener("click", () => activateBonusForStage(stageId));
  document.getElementById("bonusInfoButton")?.addEventListener("click", openBoostInfoModal);

  document.querySelectorAll("[data-pick-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (isSpinning) return;
      const option = options.find((item) => item.id === button.dataset.pickId);
      if (option) recordResult(stageId, option, "pick");
    });
  });
}



function renderNameEntry() {
  elements.stageContent.innerHTML = `
    <section class="v50-start-screen">
      <div class="v50-start-card">
        <p class="v50-kicker">Start Career</p>
        <h2>Build Your Legend</h2>
        <p>Enter a player name to start the prospect file and spin through the full NBA career.</p>
        <input id="startNameInput" class="start-name-input" maxlength="32" placeholder="Player name" autocomplete="off" />
        <p id="startNameError" class="name-error"></p>
        <button id="startCareerButton" class="spin-button">Start Career</button>
      </div>
    </section>
  `;

  const input = document.getElementById("startNameInput");
  const button = document.getElementById("startCareerButton");
  const error = document.getElementById("startNameError");

  const submit = () => {
    const value = input.value.trim();
    if (!value) {
      error.textContent = "Please enter a player name to start.";
      return;
    }

    state.playerName = value;
    elements.playerNameInput.value = value;
    saveState();
    render();
  };

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit();
  });

  button?.addEventListener("click", submit);
}



function getTeamStageBanner() {
  const team = getActiveTeamForDisplay();

  if (!team || team === "Unsigned") return "";

  return `
    <div class="team-stage-banner">
      <div>
        <span class="team-banner-label">Current Team</span>
        <span class="team-banner-name">${escapeHtml(team)}</span>
      </div>
      <span class="team-banner-abbr">${escapeHtml(teamAbbreviations[team] || "")}</span>
    </div>
  `;
}




function buildChoicePanel(options) {
  return `
    <div class="choice-panel">
      <p class="choice-title">Manual pick available</p>
      <div class="choice-grid">
        ${options.map((option) => `
          <button class="choice-button" data-pick-id="${escapeHtml(option.id)}">${escapeHtml(option.wheelLabel || option.label)}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderLatestCard(stageId) {
  return "";
}





function getStageOptions(stageId) {
  let options;

  if (careerStageIds.has(stageId)) {
    options = getCareerStageOptions(stageId);
  } else {
    const baseOptions = stages[stageId].options.map((option) => ({ ...option }));

    if (stageId === "height") options = getHeightOptionsForPosition();
    else if (stageId === "collegeRecruitment") options = getDynamicRecruitmentOptions(baseOptions);
    else if (stageId === "collegeSelection") options = getCollegeSelectionOptions();
    else if (stageId === "mockDraft") options = getDynamicMockDraftOptions(baseOptions);
    else if (stageId === "drafted") options = getDynamicDraftedOptions(baseOptions);
    else options = baseOptions;
  }

  return applyBonusToOptions(stageId, options);
}

function applyBonusToOptions(stageId, options) {
  if (!isBonusActiveForStage(stageId)) return options;

  return options.map((option) => {
    const category = classifyOutcome(stageId, option);
    const factor = getBonusFactor(category);
    return {
      ...option,
      baseWeight: option.weight,
      bonusCategory: category,
      bonusFactor: factor,
      weight: Math.max(0.05, Number(option.weight || 1) * factor),
    };
  });
}

function getBonusFactor(category) {
  if (category === "positive") return 1.6;
  if (category === "negative") return 0.65;
  if (category === "careerEnding") return 0.5;
  return 1;
}

function classifyOutcome(stageId, option) {
  if (!option) return "neutral";

  if (
    option.endsCareer ||
    option.kind === "career_injury" ||
    option.resolution === "retire" ||
    option.resolution === "end" ||
    option.movement === "retirement" ||
    option.id === "offcourt_betting"
  ) {
    return "careerEnding";
  }

  if (option.kind === "waived" || option.decision === "waived") return "negative";

  if (stageId === "career_team_spin") return "neutral";

  if (stageId === "career_points" || stageId === "career_rebounds" || stageId === "career_assists") {
    return classifyStatOutcome(stageId, Number(option.value || 0));
  }

  if (stageId === "career_defense") {
    if (Number(option.impact || 0) >= 12) return "positive";
    if (Number(option.impact || 0) < 0) return "negative";
    return "neutral";
  }

  if (stageId === "height") {
    if (Number(option.inches || 0) >= 78) return "positive";
    if (Number(option.inches || 0) <= 70) return "negative";
    return "neutral";
  }

  if (stageId === "wingspan") {
    if ((option.maxExtra || 0) >= 6 || (option.minExtra || 0) >= 4) return "positive";
    if ((option.maxExtra || 0) < 0) return "negative";
    return "neutral";
  }

  if (stageId === "collegeRecruitment" || stageId === "collegeSelection") {
    if (option.pool === "blueBlood" || option.pool === "power") return "positive";
    if (option.pool === "lastChance" || option.pool === "lowMajor") return "negative";
    return "neutral";
  }

  if (collegeYearStages.includes(stageId)) {
    const label = String(option.label || "").toLowerCase();
    if (option.declareForDraft || label.includes("national") || label.includes("star") || label.includes("breakout") || label.includes("dominant")) return "positive";
    if (label.includes("bench") || label.includes("injury") || label.includes("slump") || label.includes("bad")) return "negative";
    return "neutral";
  }

  if (stageId === "combine") {
    const score = Number(option.athletic || 0) + Number(option.shooting || 0) + Number(option.interview || 0) - Number(option.medical || 0);
    if (score >= 22) return "positive";
    if (score <= 8) return "negative";
    return "neutral";
  }

  if (stageId === "mockDraft" || stageId === "draftLottery" || stageId === "drafted") {
    const range = String(option.pickRange || option.label || "").toLowerCase();
    if (range.includes("number 1") || range.includes("top 3") || range.includes("lottery") || range.includes("rises")) return "positive";
    if (range.includes("undrafted") || range.includes("falls") || range.includes("second")) return "negative";
    return "neutral";
  }

  if (stageId === "career_playoffs_entry") {
    if (option.performance === "make") return "positive";
    if (option.performance === "miss") return "negative";
    return "neutral";
  }

  if (stageId === "career_playin") {
    return option.playin === "make" ? "positive" : "negative";
  }

  if (stageId === "career_playoff_round") {
    return option.roundResult === "advance" ? "positive" : "negative";
  }

  if (stageId === "career_finals_game") {
    return option.finalsResult === "win" ? "positive" : "negative";
  }

  if (stageId === "career_awards") {
    return option.awardResult === "yes" ? "positive" : "negative";
  }

  if (stageId === "career_endseason") {
    return option.decision === "safe" ? "positive" : "negative";
  }

  if (stageId === "career_movement") {
    if (option.movement === "same" || option.movement === "freeAgency") return "positive";
    if (option.movement === "retirement") return "careerEnding";
    return "neutral";
  }

  if (stageId === "career_comeback") {
    if (option.resolution === "resume") return "positive";
    if (option.resolution === "skipYear") return "negative";
    return "careerEnding";
  }

  if (stageId === "career_offcourt") {
    if (option.endsCareer || option.type === "careerEnding") return "careerEnding";
    if (option.type === "negative") return "negative";
    if (option.type === "positive") return "positive";
    return "neutral";
  }

  if (stageId === "career_training") {
    if (option.negativeAll) return "negative";
    return "positive";
  }

  return "neutral";
}

function classifyStatOutcome(stageId, value) {
  if (stageId === "career_points") {
    if (value >= 20) return "positive";
    if (value <= 8) return "negative";
    return "neutral";
  }

  if (stageId === "career_rebounds") {
    if (value >= 8) return "positive";
    if (value <= 3) return "negative";
    return "neutral";
  }

  if (stageId === "career_assists") {
    if (value >= 6) return "positive";
    if (value <= 2) return "negative";
    return "neutral";
  }

  return "neutral";
}



function getDynamicRecruitmentOptions(options) {
  const score = state.profile.draftStock + state.profile.mediaHype * 0.35 + state.profile.collegePerformance * 0.25;

  return options.map((option) => {
    let weight = option.weight;

    if (score >= 90) {
      if (option.pool === "blueBlood") weight += 5;
      if (option.pool === "power") weight += 3;
      if (option.pool === "lowMajor") weight -= 1;
      if (option.pool === "lastChance") weight -= 1;
    } else if (score >= 70) {
      if (option.pool === "blueBlood") weight += 2;
      if (option.pool === "power") weight += 4;
      if (option.pool === "midMajor") weight += 1;
    } else if (score <= 45) {
      if (option.pool === "midMajor") weight += 2;
      if (option.pool === "lowMajor") weight += 3;
      if (option.pool === "lastChance") weight += 2;
      if (option.pool === "blueBlood") weight -= 0.8;
    }

    return { ...option, weight: Math.max(0.1, weight) };
  });
}

function getCollegeSelectionOptions() {
  const recruitment = state.results.collegeRecruitment;
  const preferredPoolKey = recruitment?.pool || "power";

  return Object.entries(collegePools).flatMap(([poolKey, schools]) => {
    const settings = poolSettings[poolKey] || poolSettings.power;
    return schools.map((school) => {
      const isPreferredPool = poolKey === preferredPoolKey;
      return {
        id: `college_${poolKey}_${slugify(school)}`,
        label: school,
        wheelLabel: getShortCollegeLabel(school),
        weight: isPreferredPool ? 8 : getCrossPoolCollegeWeight(preferredPoolKey, poolKey),
        pool: poolKey,
        copy: `You commit to ${school}. The college chapter is locked in.`,
        effects: {
          collegePrestige: settings.prestige,
          draftStock: settings.draftStock,
          mediaHype: settings.mediaHype,
        },
      };
    });
  });
}

function getCrossPoolCollegeWeight(preferredPoolKey, candidatePoolKey) {
  if (preferredPoolKey === candidatePoolKey) return 8;

  const poolRank = {
    lastChance: 1,
    lowMajor: 2,
    midMajor: 3,
    power: 4,
    blueBlood: 5,
  };

  const preferredRank = poolRank[preferredPoolKey] || 4;
  const candidateRank = poolRank[candidatePoolKey] || 4;
  const distance = Math.abs(preferredRank - candidateRank);

  if (distance === 1) return 1.4;
  if (distance === 2) return 0.65;
  if (distance === 3) return 0.3;
  return 0.15;
}

function getShortCollegeLabel(school) {
  const shortMap = {
    "North Carolina": "UNC",
    "Michigan State": "MSU",
    "San Diego State": "SDSU",
    "Saint Mary's": "SMC",
    "Loyola Chicago": "Loyola",
    "South Dakota State": "SDSU",
    "Grand Canyon": "GCU",
    "Northwest Florida State": "NW Florida",
    "Indian Hills CC": "Indian Hills",
    "South Plains College": "South Plains",
    "Hutchinson CC": "Hutch",
    "Salt Lake CC": "SLCC",
  };

  return shortMap[school] || school;
}

function getProfileScore() {
  return (
    state.profile.draftStock +
    state.profile.collegePrestige * 0.55 +
    state.profile.collegePerformance * 0.55 +
    state.profile.mediaHype * 0.28 +
    state.profile.combineBoost -
    state.profile.medicalRisk * 0.75
  );
}

function getDynamicMockDraftOptions(options) {
  const score = getProfileScore();

  return options.map((option) => {
    let weight = option.weight;

    if (score >= 130) {
      if (option.id === "mock_top3") weight += 8;
      if (option.id === "mock_lottery") weight += 4;
      if (option.id === "mock_second") weight -= 1.5;
      if (option.id === "mock_undrafted") weight -= 1;
    } else if (score >= 105) {
      if (option.id === "mock_top3") weight += 3;
      if (option.id === "mock_lottery") weight += 6;
      if (option.id === "mock_mid_first") weight += 2;
      if (option.id === "mock_second") weight -= 1;
    } else if (score >= 80) {
      if (option.id === "mock_lottery") weight += 2;
      if (option.id === "mock_mid_first") weight += 5;
      if (option.id === "mock_late_first") weight += 2;
    } else if (score >= 60) {
      if (option.id === "mock_late_first") weight += 4;
      if (option.id === "mock_second") weight += 3;
      if (option.id === "mock_top3") weight -= 0.8;
    } else {
      if (option.id === "mock_second") weight += 5;
      if (option.id === "mock_undrafted") weight += 4;
      if (option.id === "mock_top3") weight -= 0.9;
      if (option.id === "mock_lottery") weight -= 1;
    }

    if (state.profile.medicalRisk >= 35) {
      if (option.id === "mock_second") weight += 4;
      if (option.id === "mock_undrafted") weight += 3;
      if (option.id === "mock_top3") weight -= 1;
      if (option.id === "mock_lottery") weight -= 2;
    }

    return { ...option, weight: Math.max(0.1, weight) };
  });
}

function getDynamicDraftedOptions(options) {
  const score = getProfileScore();
  const mockId = state.results.mockDraft?.id;

  return options.map((option) => {
    let weight = option.weight;

    if (score >= 130) {
      if (["drafted_1", "drafted_2", "drafted_3"].includes(option.id)) weight += 5;
      if (["drafted_4", "drafted_5", "drafted_top_10"].includes(option.id)) weight += 3;
      if (["drafted_second_round", "drafted_undrafted"].includes(option.id)) weight -= 4;
    } else if (score >= 105) {
      if (["drafted_3", "drafted_4", "drafted_5", "drafted_top_10"].includes(option.id)) weight += 4;
      if (option.id === "drafted_lottery") weight += 2;
      if (option.id === "drafted_undrafted") weight -= 3;
    } else if (score >= 80) {
      if (option.id === "drafted_top_10") weight += 2;
      if (option.id === "drafted_lottery") weight += 5;
      if (option.id === "drafted_late_first") weight += 3;
    } else if (score >= 60) {
      if (option.id === "drafted_late_first") weight += 5;
      if (option.id === "drafted_second_round") weight += 3;
      if (["drafted_1", "drafted_2"].includes(option.id)) weight -= 0.5;
    } else {
      if (option.id === "drafted_second_round") weight += 6;
      if (option.id === "drafted_undrafted") weight += 5;
      if (["drafted_1", "drafted_2", "drafted_3", "drafted_top_10"].includes(option.id)) weight -= 1;
    }

    if (mockId === "mock_top3") {
      if (["drafted_1", "drafted_2", "drafted_3", "drafted_4", "drafted_5"].includes(option.id)) weight += 5;
      if (option.id === "drafted_second_round" || option.id === "drafted_undrafted") weight -= 4;
    }

    if (mockId === "mock_lottery") {
      if (["drafted_top_10", "drafted_lottery"].includes(option.id)) weight += 6;
      if (["drafted_1", "drafted_2", "drafted_3"].includes(option.id)) weight += 1;
      if (option.id === "drafted_undrafted") weight -= 3;
    }

    if (mockId === "mock_mid_first") {
      if (["drafted_lottery", "drafted_late_first"].includes(option.id)) weight += 5;
      if (option.id === "drafted_second_round") weight += 1;
    }

    if (mockId === "mock_late_first") {
      if (option.id === "drafted_late_first") weight += 6;
      if (option.id === "drafted_second_round") weight += 2;
    }

    if (mockId === "mock_second") {
      if (option.id === "drafted_second_round") weight += 7;
      if (option.id === "drafted_late_first") weight += 2;
      if (option.id === "drafted_undrafted") weight += 1;
    }

    if (mockId === "mock_undrafted") {
      if (option.id === "drafted_second_round") weight += 5;
      if (option.id === "drafted_undrafted") weight += 7;
      if (["drafted_1", "drafted_2", "drafted_3", "drafted_top_10"].includes(option.id)) weight -= 1;
    }

    if (state.profile.medicalRisk >= 35) {
      if (option.id === "drafted_second_round") weight += 4;
      if (option.id === "drafted_undrafted") weight += 4;
      if (["drafted_1", "drafted_2", "drafted_3", "drafted_top_10", "drafted_lottery"].includes(option.id)) weight -= 2;
    }

    return { ...option, weight: Math.max(0.1, weight) };
  });
}

function getCareerStageOptions(stageId) {
  if (stageId === "career_points") return getSeasonPointsOptions();
  if (stageId === "career_rebounds") return getStatOptions("rebounds");
  if (stageId === "career_assists") return getStatOptions("assists");
  if (stageId === "career_defense") return getStatOptions("defense");
  if (stageId === "career_playoffs_entry") return getPlayoffsEntryOptions();
  if (stageId === "career_playin") return getPlayInOptions();
  if (stageId === "career_playoff_round") return getPlayoffRoundOptions();
  if (stageId === "career_finals_game") return getFinalsGameOptions();
  if (stageId === "career_awards") return getAwardsOptions();
  if (stageId === "career_endseason") return getEndSeasonDecisionOptions();
  if (stageId === "career_movement") return getMovementOptions();
  if (stageId === "career_offcourt") return getOffCourtImpactOptions();
  if (stageId === "career_training") return getTrainingFocusOptions();
  if (stageId === "career_comeback") return getComebackOptions();
  if (stageId === "career_team_spin") return getTeamSpinOptions();
  return [];
}


function getCareerEndingInjuryPct(season) {
  return clamp(season, 1, 10);
}

function getRetirementPct(season) {
  return season > 10 ? clamp((season - 10) * 2, 0, 20) : 0;
}

function getMovementRetirementPct(season) {
  if (season < 6) return 0;
  if (season <= 12) return (season - 5) * 2;
  return Math.min(14 + (season - 12) * 5, 54);
}





function getComebackRetirementWeight(season) {
  if (season <= 5) return 0;
  if (season <= 13) return (season - 5) * 3;
  return Math.min(24 + (season - 13) * 5, 50);
}

function getBaseWaivedPct(season) {
  if (season <= 10) return 11 - season;
  if (season === 11) return 1;
  return clamp(season - 10, 1, 10);
}

function getDynamicWaivedPct(season) {
  const base = getBaseWaivedPct(season);
  const prior = getLastCompletedNbaSeason();

  let multiplier = 1;

  if (prior) {
    if (prior.score >= 78) multiplier = 0.25;
    else if (prior.score >= 62) multiplier = 0.40;
    else if (prior.score >= 48) multiplier = 0.65;
    else if (prior.score >= 35) multiplier = 0.90;
    else if (prior.score >= 24) multiplier = 1.20;
    else if (prior.score >= 14) multiplier = 1.55;
    else multiplier = 2.00;
  }

  const offCourtRisk = Number(state.career.pendingSeason?.offCourtRiskShift || 0);
  return Number(clamp(base * multiplier + offCourtRisk, 0.5, 35).toFixed(2));
}


function getLastCompletedNbaSeason() {
  const seasons = state.career.seasons.filter((season) => !season.nonNbaSeason && typeof season.score === "number");
  return seasons.length ? seasons[seasons.length - 1] : null;
}

function getSeasonPointsOptions() {
  const season = state.career.seasonNumber;
  const injuryPct = getCareerEndingInjuryPct(season);
  const retirementPct = getRetirementPct(season);
  const waivedPct = state.career.pendingSeason?.waiverResolved ? 0 : getDynamicWaivedPct(season);

  const specials = [
    {
      id: "career_ending_injury",
      label: "Career Ending Injury",
      wheelLabel: "Injury",
      weight: injuryPct,
      kind: "career_injury",
      copy: "A devastating injury ends the playing career immediately.",
    },
  ];

  if (waivedPct > 0) {
    specials.push({
      id: "waived_cut",
      label: "Waived / Cut",
      wheelLabel: "Waived",
      weight: waivedPct,
      kind: "waived",
      copy: "The team cuts you before the season settles. One comeback spin decides whether the NBA path continues.",
    });
  }

  if (retirementPct > 0) {
    specials.push({
      id: "retirement",
      label: "Retirement",
      wheelLabel: "Retire",
      weight: retirementPct,
      kind: "retirement",
      copy: "The body, the role, or the timing says it is time. You retire from professional basketball.",
    });
  }

  const statTotal = Math.max(5, 100 - specials.reduce((sum, option) => sum + option.weight, 0));
  const weightedStats = getStatOptions("points", statTotal);
  return [...weightedStats, ...specials];
}

function getStatOptions(type, targetTotal = 100) {
  let raw = statOptions[type].map((option) => {
    const weight = getDynamicStatWeight(type, option);
    return {
      ...option,
      type,
      weight,
      kind: "stat",
      copy: getStatCopy(type, option),
    };
  });

  raw = applyTrainingFocusToStatOptions(type, raw);

  const total = raw.reduce((sum, option) => sum + option.weight, 0);
  return raw.map((option) => ({
    ...option,
    weight: Math.max(0.1, Number(((option.weight / total) * targetTotal).toFixed(2))),
  }));
}

function applyTrainingFocusToStatOptions(type, options) {
  const focus = state.career?.pendingSeason?.trainingFocus;
  if (!focus) return options;

  return options.map((option) => {
    const category = classifyStatTrainingOutcome(type, option);
    let weight = Number(option.weight || 0);

    if (focus.negativeAll) {
      if (category === "positive") weight *= 0.95;
      if (category === "negative") weight *= 1.05;
    } else if (focus.target === type && category === "positive") {
      weight *= 1.25;
    }

    return {
      ...option,
      weight,
      trainingFocusApplied: focus.label,
    };
  });
}

function classifyStatTrainingOutcome(type, option) {
  if (type === "points") {
    if (Number(option.value || 0) >= 20) return "positive";
    if (Number(option.value || 0) <= 8) return "negative";
    return "neutral";
  }

  if (type === "rebounds") {
    if (Number(option.value || 0) >= 8) return "positive";
    if (Number(option.value || 0) <= 3) return "negative";
    return "neutral";
  }

  if (type === "assists") {
    if (Number(option.value || 0) >= 6) return "positive";
    if (Number(option.value || 0) <= 2) return "negative";
    return "neutral";
  }

  if (type === "defense") {
    if (Number(option.impact || 0) >= 12) return "positive";
    if (Number(option.impact || 0) < 0) return "negative";
    return "neutral";
  }

  return "neutral";
}



function getDynamicStatWeight(type, option) {
  const positionId = state.results.position?.id || "pos_sg";
  const height = state.results.height?.inches || 78;
  const wingspanExtra = state.results.wingspan?.extra || 0;
  const strength = getCareerStrengthScore();
  const strengthAdj = clamp((strength - 70) / 9, -8, 18);
  const offCourtShift = Number(state.career.pendingSeason?.offCourtStatShift || 0);

  const targets = {
    points: { pos_pg: 15, pos_sg: 18, pos_sf: 16, pos_pf: 14, pos_c: 13 },
    rebounds: { pos_pg: 3, pos_sg: 4, pos_sf: 6, pos_pf: 8, pos_c: 10 },
    assists: { pos_pg: 8, pos_sg: 4, pos_sf: 4, pos_pf: 3, pos_c: 2 },
    defense: { pos_pg: 7, pos_sg: 8, pos_sf: 11, pos_pf: 12, pos_c: 14 },
  };

  let target = targets[type][positionId] || 8;

  if (type === "points") target += strengthAdj + offCourtShift;
  if (type === "rebounds") target += (height - 78) * 0.45 + strengthAdj * 0.18 + offCourtShift * 0.28;
  if (type === "assists") target += (positionId === "pos_pg" ? strengthAdj * 0.18 : strengthAdj * 0.08) + offCourtShift * 0.22;
  if (type === "defense") target += wingspanExtra * 0.8 + strengthAdj * 0.12 + offCourtShift * 0.55;

  const value = type === "defense" ? option.impact : option.value;
  const distance = Math.abs(value - target);
  let weight = option.base * Math.max(0.15, 1.7 - distance / (type === "defense" ? 18 : 9));

  if (strength > 105 && value >= target + 6) weight *= 1.7;
  if (strength < 55 && value <= target - 4) weight *= 1.6;
  if (type === "points" && value >= 30 && strength > 95) weight *= 1.5;
  if (type === "rebounds" && value >= 13 && (positionId === "pos_pf" || positionId === "pos_c")) weight *= 1.4;
  if (type === "assists" && value >= 9 && positionId === "pos_pg") weight *= 1.5;
  if (type === "defense" && option.impact >= 22 && wingspanExtra >= 6) weight *= 1.45;

  return Math.max(0.08, weight);
}


function getCareerStrengthScore() {
  const draft = state.results.drafted;
  const draftBoost = {
    drafted_1: 45,
    drafted_2: 40,
    drafted_3: 37,
    drafted_4: 34,
    drafted_5: 32,
    drafted_top_10: 28,
    drafted_lottery: 22,
    drafted_late_first: 15,
    drafted_second_round: 6,
    drafted_undrafted: -18,
  }[draft?.id] || 0;

  const recent = state.career.seasons.slice(-2);
  const recentBoost = recent.length ? recent.reduce((sum, season) => sum + season.score, 0) / recent.length / 2 : 0;
  const awardBoost = state.career.awards.mvp * 12 + state.career.awards.allNbaFirst * 8 + state.career.awards.allNba * 5 + state.career.awards.allStar * 3;
  const agePenalty = Math.max(0, state.career.seasonNumber - 12) * 2.5;

  return 45 + draftBoost + state.profile.draftStock * 0.28 + recentBoost + awardBoost - agePenalty;
}

function getStatCopy(type, option) {
  if (type === "points") return `Season scoring average lands at ${option.value.toFixed(1)} PPG.`;
  if (type === "rebounds") return `Season rebounding average lands at ${option.value.toFixed(1)} RPG.`;
  if (type === "assists") return `Season playmaking average lands at ${option.value.toFixed(1)} APG.`;
  return `${option.label}. Defensive impact is added to the season score.`;
}


function getEndSeasonDecisionOptions() {
  const season = state.career.seasons[state.career.seasons.length - 1];
  const score = season?.score || 0;
  const seasonNumber = state.career.seasonNumber;

  let waivedWeight;
  if (score >= 78) waivedWeight = 0.25;
  else if (score >= 62) waivedWeight = 0.6;
  else if (score >= 48) waivedWeight = 1.5;
  else if (score >= 35) waivedWeight = 4;
  else if (score >= 24) waivedWeight = 9;
  else if (score >= 14) waivedWeight = 16;
  else waivedWeight = 26;

  if (seasonNumber >= 11 && score < 35) waivedWeight += (seasonNumber - 10) * 1.4;

  return [
    {
      id: "endseason_safe",
      label: "Roster Spot Secured",
      wheelLabel: "Safe",
      decision: "safe",
      weight: score >= 62 ? 24 : score >= 35 ? 18 : 10,
      copy: "The team keeps you in the plans heading into the offseason.",
    },
    {
      id: "endseason_waived",
      label: "Waived After Season",
      wheelLabel: "Waived",
      decision: "waived",
      weight: Math.max(0.2, Number(waivedWeight.toFixed(2))),
      copy: "The season was not strong enough. The team waives you after the year and the next season starts with a comeback spin.",
    },
  ];
}

function getTeamSpinOptions() {
  return nbaTeams.map((team) => {
    const theme = (typeof teamThemes !== "undefined" && teamThemes[team]) || ["#174f96", "#ffffff"];
    return {
      id: `team_${slugify(team)}`,
      label: team,
      wheelLabel: (typeof teamAbbreviations !== "undefined" && teamAbbreviations[team]) || team,
      team,
      weight: 1,
      backgroundColor: theme[0],
      labelColor: getReadableLabelColor(theme[0]),
      copy: `${team} give you the next NBA opportunity.`,
    };
  });
}

function getReadableLabelColor(hex) {
  const cleaned = String(hex).replace("#", "");
  const full = cleaned.length === 3
    ? cleaned.split("").map((char) => char + char).join("")
    : cleaned;

  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness > 140 ? "#111418" : "#ffffff";
}

function getCurrentSeasonRecord() {
  const seasonNumber = state.career?.seasonNumber;
  const seasons = state.career?.seasons || [];
  for (let i = seasons.length - 1; i >= 0; i -= 1) {
    if (seasons[i].season === seasonNumber) return seasons[i];
  }
  return seasons.length ? seasons[seasons.length - 1] : null;
}

function getSeasonScoreBand(score) {
  if (score >= 115) return "goat";
  if (score >= 95) return "mvp";
  if (score >= 78) return "allNba";
  if (score >= 62) return "allStar";
  if (score >= 35) return "starter";
  if (score >= 14) return "bad";
  return "disaster";
}

function getPlayoffsEntryOptions() {
  const season = getCurrentSeasonRecord();
  const score = season?.score || 0;
  const band = getSeasonScoreBand(score);

  const matrix = {
    goat: [85, 10, 5],
    mvp: [75, 15, 10],
    allNba: [65, 20, 15],
    allStar: [50, 25, 25],
    starter: [35, 25, 40],
    bad: [20, 20, 60],
    disaster: [8, 12, 80],
  };

  const [make, playin, miss] = matrix[band] || matrix.starter;

  return [
    { id: "playoffs_make", label: "Make Playoffs", wheelLabel: "Playoffs", performance: "make", weight: make, copy: "The regular season gets you straight into the playoff bracket." },
    { id: "playoffs_playin", label: "Play-In", wheelLabel: "Play-In", performance: "playin", weight: playin, copy: "The season is alive, but you need to survive the play-in." },
    { id: "playoffs_miss", label: "Miss Playoffs", wheelLabel: "Miss", performance: "miss", weight: miss, copy: "The team misses the postseason." },
  ];
}

function getPlayInOptions() {
  const season = getCurrentSeasonRecord();
  const score = season?.score || 0;
  const band = getSeasonScoreBand(score);

  const make = {
    goat: 75,
    mvp: 75,
    allNba: 65,
    allStar: 55,
    starter: 45,
    bad: 30,
    disaster: 20,
  }[band] || 45;

  return [
    { id: "playin_make", label: "Make Playoffs", wheelLabel: "Make", playin: "make", weight: make, copy: "You survive the play-in and enter the First Round." },
    { id: "playin_eliminated", label: "Eliminated", wheelLabel: "Out", playin: "out", weight: 100 - make, copy: "The play-in ends the season." },
  ];
}

function getPlayoffRoundOptions() {
  const season = getCurrentSeasonRecord();
  const round = season?.playoffs?.currentRound || "First Round";
  const base = {
    "First Round": 50,
    "Conference Semi Finals": 45,
    "Conference Finals": 40,
  }[round] || 45;

  const modifier = getPlayoffScoreModifier(season?.score || 0);
  const advance = clamp(base + modifier, 8, 88);

  return [
    { id: "round_advance", label: "Advance", wheelLabel: "Advance", roundResult: "advance", weight: advance, copy: `You advance from the ${round}.` },
    { id: "round_eliminated", label: "Eliminated", wheelLabel: "Out", roundResult: "eliminated", weight: 100 - advance, copy: `The run ends in the ${round}.` },
  ];
}

function getPlayoffScoreModifier(score) {
  if (score >= 115) return 25;
  if (score >= 95) return 18;
  if (score >= 78) return 12;
  if (score >= 62) return 6;
  if (score >= 35) return 0;
  if (score >= 14) return -10;
  return -20;
}

function getFinalsGameOptions() {
  const season = getCurrentSeasonRecord();
  const playoffs = ensurePlayoffState(season);
  const game = playoffs.finalsGame || 1;
  const location = getFinalsGameLocation(playoffs.homeCourtAdvantage, game);
  const base = getFinalsBaseWinChance(season?.score || 0);

  let locationMod = 0;
  if (game === 7) {
    locationMod = location === "Home" ? 2 : -2;
  } else {
    locationMod = location === "Home" ? 7 : -7;
  }

  const win = clamp(base + locationMod, 18, 84);

  return [
    { id: `finals_g${game}_win`, label: "Win", wheelLabel: "Win", finalsResult: "win", location, weight: win, copy: `Game ${game} is ${location.toLowerCase()}. Home court matters, and you win the game.` },
    { id: `finals_g${game}_loss`, label: "Loss", wheelLabel: "Loss", finalsResult: "loss", location, weight: 100 - win, copy: `Game ${game} is ${location.toLowerCase()}. Home court matters, and you lose the game.` },
  ];
}



function getFinalsBaseWinChance(score) {
  if (score >= 115) return 68;
  if (score >= 95) return 62;
  if (score >= 78) return 57;
  if (score >= 62) return 52;
  if (score >= 35) return 48;
  if (score >= 14) return 40;
  return 32;
}

function getFinalsGameLocation(hasHomeCourt, game) {
  // If the user's team has home court, Games 1, 2, 5 and 7 are at home.
  // If not, Games 3, 4 and 6 are at home. This makes the first two games either home or road as a random series setup.
  const homeCourtHomeGames = [1, 2, 5, 7];
  const userHome = hasHomeCourt ? homeCourtHomeGames.includes(game) : !homeCourtHomeGames.includes(game);
  return userHome ? "Home" : "Road";
}



function ensurePlayoffState(season) {
  if (!season.playoffs) {
    season.playoffs = {
      status: "Pending",
      currentRound: null,
      homeCourtAdvantage: false,
      finalsGame: 1,
      finalsWins: 0,
      finalsLosses: 0,
      games: [],
    };
  }
  return season.playoffs;
}

function markPlayoffAppearance(season) {
  const playoffs = ensurePlayoffState(season);
  if (playoffs.playoffAppearanceCounted) return;

  playoffs.playoffAppearanceCounted = true;
  state.career.playoffStats.playoffAppearances += 1;
}

function markConferenceFinals(season) {
  const playoffs = ensurePlayoffState(season);
  if (playoffs.conferenceFinalsCounted) return;

  playoffs.conferenceFinalsCounted = true;
  state.career.playoffStats.conferenceFinals += 1;
}

function markFinalsAppearance(season) {
  const playoffs = ensurePlayoffState(season);
  if (playoffs.finalsAppearanceCounted) return;

  playoffs.finalsAppearanceCounted = true;
  state.career.playoffStats.finalsAppearances += 1;
}

function updateBestPlayoffFinish(finish) {
  const order = {
    "None": 0,
    "Missed Playoffs": 1,
    "Play-In Exit": 2,
    "First Round Exit": 3,
    "Conference Semi Finals Exit": 4,
    "Conference Finals": 5,
    "NBA Finals Loss": 6,
    "NBA Champion": 7,
  };

  const current = state.career.playoffStats.bestFinish || "None";
  if ((order[finish] || 0) > (order[current] || 0)) {
    state.career.playoffStats.bestFinish = finish;
  }
}

function getAfterTeamPerformanceStage() {
  const season = getCurrentSeasonRecord();
  if (!season) return "career_endseason";

  prepareAwardQueue(season);
  return season.awardQueue && season.awardQueue.length ? "career_awards" : "career_endseason";
}



function getAwardPlayoffBoost(season) {
  const finish = season?.teamPerformance || "";
  if (finish === "NBA Champion") return 10;
  if (finish === "NBA Finals Loss") return 7;
  if (finish === "Conference Finals") return 4;
  if (finish === "Conference Semi Finals Exit") return 2;
  if (finish === "Missed Playoffs") return -2;
  if (finish === "Play-In Exit") return -1;
  return 0;
}

function getOffCourtImpactOptions() {
  const used = new Set(state.career.offCourtUsedIds || []);
  const available = offseasonLifeEvents.filter((option) => !used.has(option.id));

  if (!available.length) {
    return [{
      id: "offcourt_quiet",
      label: "Quiet Offseason",
      wheelLabel: "Quiet Offseason",
      summaryLabel: "Quiet Offseason",
      type: "neutral",
      weight: 1,
      spinBoostChange: 0,
      statShift: 0,
      riskShift: 0,
      legacyShift: 0,
      copy: "Spend every night with a peppermint tea binging all of the Sopranos. Vanilla, but gets the job done.",
    }];
  }

  const careerEnding = available.find((option) => option.endsCareer);
  const normal = available.filter((option) => !option.endsCareer);
  const normalWeight = normal.length ? 95 / normal.length : 0;

  return available.map((option) => ({
    ...option,
    weight: option.endsCareer ? 5 : Number(normalWeight.toFixed(3)),
  }));
}

function getTrainingFocusOptions() {
  return trainingFocusOptions.map((option) => ({ ...option }));
}

function getTrainingFocusById(id) {
  return trainingFocusOptions.find((option) => option.id === id) || trainingFocusOptions.find((option) => option.id === "training_cancun");
}

function applyTrainingFocus(option) {
  if (!option) return;
  state.career.nextSeasonTrainingFocus = {
    id: option.id,
    label: option.label,
    target: option.target,
    negativeAll: Boolean(option.negativeAll),
  };
}

function getTrainingFocusSummary(focus) {
  if (!focus) return "";
  if (focus.negativeAll) return "Training Focus: Cancun - all main stat wheels take a negative training hit next season.";
  const label = focus.label || "Training Focus";
  return `Training Focus: ${label} - ${label.replace(" Focus", "")} gets a training boost next season.`;
}

function getCurrentTrainingFocusTag() {
  const focus = state.career?.pendingSeason?.trainingFocus;
  if (!focus) return "";
  if (focus.negativeAll) return "Cancun penalty active";
  return `${focus.label} active`;
}







function prepareAwardQueue(season) {
  const checks = [
    buildAwardCheck("roy", season),
    buildAwardCheck("mvp", season),
    buildAwardCheck("allNbaFirst", season),
    buildAwardCheck("allNba", season),
    buildAwardCheck("allStar", season),
    buildAwardCheck("scoringTitle", season),
    buildAwardCheck("dpoy", season),
  ].filter(Boolean);

  season.awardQueue = checks;
}

function buildAwardCheck(type, season) {
  const path = getAwardYesChance(type, season);
  if (path < 5) return null;

  const labels = {
    roy: ["Rookie of the Year", "ROY"],
    mvp: ["MVP", "MVP"],
    allNbaFirst: ["All-NBA First Team", "1st Team"],
    allNba: ["All-NBA 2nd/3rd Team", "2nd/3rd"],
    allStar: ["All-Star", "All-Star"],
    scoringTitle: ["Scoring Title", "Scoring"],
    dpoy: ["Defensive Player of the Year", "DPOY"],
  };

  const [label, wheelLabel] = labels[type];

  return {
    type,
    label,
    wheelLabel,
    yesChance: path,
    noChance: 100 - path,
    stageName: `Season ${season.season} - ${label}?`,
    shortName: `${label}?`,
    description: `${label} check. Award result is based on the season résumé.`,
    actionLabel: `Spin ${wheelLabel}`,
  };
}

function getAwardYesChance(type, season) {
  const score = season.score || 0;
  const ppg = season.ppg || 0;
  const rpg = season.rpg || 0;
  const apg = season.apg || 0;
  const def = season.defenseImpact || 0;
  const playoffBoost = getAwardPlayoffBoost(season);
  const isRookie = season.season === 1;

  let path = 0;

  if (type === "roy") {
    if (!isRookie) return 0;
    if (score >= 115) path = 96;
    else if (score >= 95) path = 90;
    else if (score >= 78) path = 78;
    else if (score >= 62) path = 55;
    else if (score >= 45) path = 28;
    else path = 6;
  }

  if (type === "mvp") {
    if (score >= 115) path = season.teamPerformance === "NBA Champion" || season.teamPerformance === "NBA Finals Loss" ? 98 : 95;
    else if (score >= 105) path = 78;
    else if (score >= 95) path = 58;
    else if (score >= 82) path = 20;
    else if (score >= 72) path = 7;
    else path = 0;
  }

  if (type === "allNbaFirst") {
    if (season.awards?.includes("All-NBA First Team")) return 0;
    if (score >= 115) path = 98;
    else if (score >= 95) path = 85;
    else if (score >= 82) path = 55;
    else if (score >= 78) path = 35;
    else if (score >= 68) path = 10;
    else path = 0;
  }

  if (type === "allNba") {
    if (season.awards?.includes("All-NBA First Team")) return 0;
    if (score >= 78) path = 68;
    else if (score >= 62) path = 45;
    else if (score >= 52) path = 20;
    else path = 0;
  }

  if (type === "allStar") {
    if (score >= 115) path = 99;
    else if (score >= 95) path = 98;
    else if (score >= 78) path = 90;
    else if (score >= 62) path = 75;
    else if (score >= 45) path = 35;
    else if (ppg >= 18 || rpg >= 11 || apg >= 8) path = 12;
    else path = 0;
  }

  if (type === "scoringTitle") {
    if (ppg >= 38) path = 90;
    else if (ppg >= 35) path = 78;
    else if (ppg >= 32) path = 58;
    else if (ppg >= 30) path = 35;
    else if (ppg >= 28) path = 15;
    else path = 0;
  }

  if (type === "dpoy") {
    if (def >= 30) path = 74;
    else if (def >= 22) path = 35;
    else if (def >= 12 && (rpg >= 8 || score >= 62)) path = 9;
    else path = 0;
  }

  if (["mvp", "allNbaFirst", "allNba", "allStar"].includes(type)) {
    path += playoffBoost;
  }

  return Math.round(clamp(path, 0, 99));
}

function getCurrentAwardCheck() {
  const season = getCurrentSeasonRecord();
  if (!season?.awardQueue || !season.awardQueue.length) return null;
  return season.awardQueue[0];
}

function getAwardsOptions() {
  const check = getCurrentAwardCheck();
  if (!check) return [];

  return [
    {
      id: `award_${check.type}_yes`,
      label: `Yes - ${check.label}`,
      wheelLabel: "Yes",
      awardResult: "yes",
      awardKey: check.type,
      awardLabel: check.label,
      weight: check.yesChance,
      copy: `You win ${check.label}.`,
    },
    {
      id: `award_${check.type}_no`,
      label: `No - ${check.label}`,
      wheelLabel: "No",
      awardResult: "no",
      awardKey: check.type,
      awardLabel: check.label,
      weight: check.noChance,
      copy: `You do not win ${check.label}.`,
    },
  ];
}




function getMovementOptions() {
  const strength = getCareerStrengthScore();
  const season = state.career.seasonNumber;
  const retirementPct = getMovementRetirementPct(season);

  const options = [
    { id: "movement_same", label: "Same Team", wheelLabel: "Stay", movement: "same", weight: strength > 100 ? 8 : 6, copy: "You stay with the same team for another season." },
    { id: "movement_traded", label: "Traded", wheelLabel: "Traded", movement: "trade", weight: strength < 60 ? 3.5 : 2, copy: "A trade sends you to a new team." },
    { id: "movement_free_agency", label: "Free Agency", wheelLabel: "FA", movement: "freeAgency", weight: state.career.seasonNumber >= 4 ? 3 : 1.5, copy: "Free agency opens. Spin to decide which team signs you." },
  ];

  if (retirementPct > 0) {
    const baseTotal = options.reduce((sum, option) => sum + Number(option.weight || 0), 0);
    const retirementWeight = baseTotal * retirementPct / Math.max(1, 100 - retirementPct);

    options.push({
      id: "movement_retirement",
      label: "Retirement",
      wheelLabel: "Retire",
      movement: "retirement",
      weight: Number(retirementWeight.toFixed(4)),
      targetPct: retirementPct,
      copy: "After weighing the next chapter, you retire from basketball.",
    });
  }

  return options;
}







function getComebackOptions() {
  const undrafted = state.results.drafted?.id === "drafted_undrafted";
  const seasonsPlayed = state.career.seasons.length;
  const strength = getCareerStrengthScore();
  const season = state.career.seasonNumber;

  let signs = undrafted && seasonsPlayed === 0 ? 4 : 10;
  let twoWay = undrafted && seasonsPlayed === 0 ? 12 : 8;
  let gleague = undrafted && seasonsPlayed === 0 ? 18 : 10;
  let overseas = undrafted && seasonsPlayed === 0 ? 18 : 8;
  let noReturn = undrafted && seasonsPlayed === 0 ? 22 : 8;

  if (strength > 80) {
    signs += 8;
    twoWay += 3;
    noReturn -= 4;
  }

  if (strength < 45) {
    gleague += 5;
    overseas += 5;
    noReturn += 8;
  }

  const options = [
    { id: "comeback_nba", label: "Signs With New NBA Team", wheelLabel: "NBA Deal", resolution: "resume", contract: "NBA Contract", weight: signs, copy: "A team gives you a real NBA contract. The season is back on." },
    { id: "comeback_two_way", label: "Two-Way Contract", wheelLabel: "Two-Way", resolution: "resume", contract: "Two-Way Contract", weight: twoWay, copy: "You earn a two-way contract. It is not safe, but the NBA door is open." },
    { id: "comeback_gleague", label: "G League Rebuild Year", wheelLabel: "G League", resolution: "skipYear", weight: gleague, copy: "You spend the year rebuilding in the G League. Next season becomes another path." },
    { id: "comeback_overseas", label: "Overseas Season", wheelLabel: "Overseas", resolution: "skipYear", weight: overseas, copy: "You go overseas for a season. The NBA dream gets another spin next year." },
    { id: "comeback_no_return", label: "No NBA Return", wheelLabel: "No Return", resolution: "end", weight: noReturn, copy: "The calls do not come. The NBA career is on the brink." },
  ];

  const retirementWeight = getComebackRetirementWeight(season);
  if (retirementWeight > 0) {
    options.push({
      id: "comeback_retirement",
      label: "Retirement",
      wheelLabel: "Retire",
      resolution: "retire",
      weight: retirementWeight,
      copy: "After another fight to get back, you decide the comeback road is over and retire.",
    });
  }

  return options.map((option) => ({ ...option, weight: Math.max(0.1, option.weight) }));
}



function getLegacyOptions() {
  const score = getLegacyScore();

  const options = [
    { id: "legacy_goat", label: "GOAT Debate", wheelLabel: "GOAT", weight: score >= 360 ? 4 : score >= 300 ? 1 : 0.1, copy: "The career enters impossible debate territory." },
    { id: "legacy_all_time", label: "All-Time Great", wheelLabel: "All-Time", weight: score >= 280 ? 6 : score >= 220 ? 2 : 0.1, copy: "The résumé is all-time great level." },
    { id: "legacy_hof_lock", label: "Hall of Fame Lock", wheelLabel: "HOF Lock", weight: score >= 190 ? 8 : score >= 150 ? 3 : 0.2, copy: "The Hall of Fame call is not a debate." },
    { id: "legacy_hof_debate", label: "Hall of Fame Debate", wheelLabel: "HOF?", weight: score >= 125 ? 8 : score >= 90 ? 3 : 0.5, copy: "The résumé starts arguments every time." },
    { id: "legacy_icon", label: "Franchise Icon", wheelLabel: "Icon", weight: score >= 95 ? 7 : 2, copy: "Maybe not the GOAT, but fans will never forget it." },
    { id: "legacy_solid", label: "Solid Pro", wheelLabel: "Solid", weight: score >= 45 ? 10 : 4, copy: "A real NBA career with plenty to be proud of." },
    { id: "legacy_cult", label: "Cult Hero", wheelLabel: "Cult", weight: score >= 20 ? 7 : 3, copy: "The box score does not explain the love." },
    { id: "legacy_bust", label: "Draft Bust", wheelLabel: "Bust", weight: score < 60 ? 8 : 0.5, copy: "Expectations were much higher than the career delivered." },
    { id: "legacy_what_if", label: "What Could Have Been", wheelLabel: "What If", weight: state.endingType === "nba_injury" ? 12 : score < 35 ? 5 : 1, copy: "The talent was there. The full story never quite arrived." },
  ];

  return options.map((option) => ({ ...option, weight: Math.max(0.1, option.weight) }));
}

function isAwardsEligible(season) {
  return season.score >= 45 || season.ppg >= 22 || season.rpg >= 10 || season.apg >= 7 || season.defenseImpact >= 18;
}


function shouldUseFallbackWheel() {
  const isSmallScreen = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 760px)").matches;

  return isSmallScreen;
}

function createFallbackWheel(container, options, reason = "mobile") {
  activeWheelItems = buildVisualWheelItems(options, activeStageId);
  const visibleOptions = activeWheelItems.slice(0, 16);
  const chips = visibleOptions.map((option, index) => {
    const angle = (360 / Math.max(visibleOptions.length, 1)) * index;
    return `<span class="fallback-wheel-chip" style="transform: rotate(${angle}deg) translate(38%, -50%) rotate(90deg);">${escapeHtml(option.label || option.wheelLabel || option.value)}</span>`;
  }).join("");

  container.innerHTML = `
    <div id="fallbackWheel" class="fallback-wheel" aria-label="Mobile fallback wheel">
      <div class="fallback-wheel-segments">${chips}</div>
      <div id="fallbackWheelLabel" class="fallback-wheel-label">
        Ready
        <small>${reason === "library" ? "Offline/mobile fallback" : "Mobile wheel"}</small>
      </div>
    </div>
    <p class="fallback-wheel-note">Mobile-safe wheel renderer active.</p>
  `;

  let rotation = 0;

  wheelInstance = {
    spinToItem(index, duration) {
      const wheel = document.getElementById("fallbackWheel");
      const label = document.getElementById("fallbackWheelLabel");
      const visualItem = activeWheelItems[index] || activeWheelItems[0];

      if (!wheel || !visualItem) return;

      const segmentCount = Math.max(activeWheelItems.length, 1);
      const segmentAngle = 360 / segmentCount;
      rotation += 1440 + (360 - index * segmentAngle);
      wheel.style.transitionDuration = `${Math.max(900, duration)}ms`;
      wheel.style.transform = `rotate(${rotation}deg)`;

      if (label) {
        label.innerHTML = `Spinning<small>Locking result...</small>`;
        setTimeout(() => {
          label.innerHTML = `${escapeHtml(visualItem.label)}<small>Result locked</small>`;
        }, Math.max(300, duration - 650));
      }
    },
    remove() {
      container.innerHTML = "";
    },
  };
}



function createLibraryWheel(stage, options) {
  const WheelClass = getWheelClass();
  const container = document.getElementById("wheelContainer");

  if (!container) return;

  if (shouldUseFallbackWheel()) {
    createFallbackWheel(container, options, "mobile");
    return;
  }

  if (!WheelClass) {
    createFallbackWheel(container, options, "library");
    return;
  }

  activeWheelItems = buildVisualWheelItems(options, activeStageId);
  const items = activeWheelItems;
  const isDefenseStage = activeStageId === "career_defense";
  const labelFontSizeMax = isDefenseStage
    ? 36
    : (options.length >= 80 ? 13 : options.length >= 50 ? 15 : options.length >= 24 ? 17 : options.length >= 14 ? 20 : options.length >= 10 ? 23 : 32);
  const labelRadius = isDefenseStage
    ? 0.78
    : (options.length >= 50 ? 0.88 : options.length >= 18 ? 0.84 : options.length >= 10 ? 0.80 : 0.76);
  const labelRadiusMax = isDefenseStage
    ? 0.38
    : (options.length >= 80 ? 0.16 : options.length >= 50 ? 0.18 : options.length >= 24 ? 0.20 : options.length >= 14 ? 0.26 : 0.32);

  try {
    wheelInstance = new WheelClass(container, {
      items,
      pointerAngle: 90,
      radius: 0.94,
      rotation: 0,
      isInteractive: false,
      lineColor: "#141414",
      lineWidth: 2,
      borderColor: "#141414",
      borderWidth: 6,
      itemLabelAlign: "right",
      itemLabelFont: "Arial, Helvetica, sans-serif",
      itemLabelFontSizeMax: labelFontSizeMax,
      itemLabelRadius: labelRadius,
      itemLabelRadiusMax: labelRadiusMax,
      itemLabelRotation: 0,
      itemLabelStrokeColor: "rgba(0, 0, 0, 0.48)",
      itemLabelStrokeWidth: 2,
      onRest: () => {
        finishPendingSpin();
      },
    });
  } catch (error) {
    console.error(error);
    createFallbackWheel(container, options, "library");
  }
}

function destroyWheel() {
  if (wheelInstance && typeof wheelInstance.remove === "function") {
    wheelInstance.remove();
  }

  wheelInstance = null;
  activeStageId = null;
  activeOptions = [];
  activeWheelItems = [];
}



function spinStage(stageId) {
  if (isSpinning || !wheelInstance || !activeOptions.length) return;

  const usingBonus = isBonusActiveForStage(stageId);
  const { option, index } = pickWeighted(activeOptions);

  if (usingBonus) {
    state.bonus.count = Math.max(0, getBonusCount() - 1);
    clearBonusActive();
  }

  const matchingVisualIndexes = activeWheelItems
    .map((item, visualIndex) => ({ item, visualIndex }))
    .filter(({ item }) => item.sourceIndex === index || item.sourceValue === option.id || item.value === option.id)
    .map(({ visualIndex }) => visualIndex);

  const visualIndex = matchingVisualIndexes.length ? randomChoice(matchingVisualIndexes) : index;

  lastSpinSnapshot = JSON.stringify(state);
  lastSpinStageId = stageId;

  selectedSpin = { stageId, option };
  isSpinning = true;
  setSpinControls(true);

  const revolutions = 5 + Math.floor(Math.random() * 2);
  const duration = 4200;

  try {
    wheelInstance.spinToItem(visualIndex, duration, false, revolutions, 1, cubicOut);
  } catch (error) {
    console.error(error);
    finishPendingSpin();
    return;
  }

  spinTimeout = setTimeout(() => {
    finishPendingSpin();
  }, duration + 450);
}





function cubicOut(n) {
  return 1 - Math.pow(1 - n, 3);
}

function finishPendingSpin() {
  if (!selectedSpin) return;

  const { stageId, option } = selectedSpin;
  selectedSpin = null;
  isSpinning = false;

  if (spinTimeout) {
    clearTimeout(spinTimeout);
    spinTimeout = null;
  }

  setSpinControls(false);
  recordResult(stageId, option, "spin");
}

function setSpinControls(disabled) {
  const spinButton = document.getElementById("spinButton");
  const stage = getStageDefinition(activeStageId);
  if (spinButton) {
    spinButton.disabled = disabled;
    spinButton.textContent = disabled ? "Spinning..." : stage?.actionLabel || "Spin";
  }

  document.querySelectorAll(".choice-button").forEach((button) => {
    button.disabled = disabled;
  });
}


function getSpinBoostIntroHtml() {
  return `
    <span class="spin-boost-intro-card">
      <strong>Spin Boosts unlocked</strong>
      <span>You start with 3 Spin Boosts. Use one before a spin to increase positive segments, or spend one after a result to re-spin that same wheel with normal board.</span>
      <span>Earn more with big career moments: Championship +3, MVP +2, Scoring Title or DPOY +1.</span>
    </span>
  `;
}

function maybeAttachSpinBoostIntro(stageId, result) {
  return;
}

function recordResult(stageId, option, source, silent = false) {
  if (careerStageIds.has(stageId)) {
    recordCareerResult(stageId, option, source, silent);
    return;
  }

  const stage = getStageDefinition(stageId);
  const result = shapeResult(stageId, option, source);

  state.results[stageId] = result;
  applyEffects(option.effects || result.effects || {});

  if (option.declareForDraft) {
    state.flags.declareStage = stageId;
    result.declareForDraft = true;
  }

  if (option.endsCareer) {
    state.completed = true;
    state.endingType = "injury";
    result.endsCareer = true;
  }

  state.log.unshift({
    stageName: stage.name,
    title: result.headline || result.label,
    extra: result.logExtra || result.copy || "Result locked.",
    type: result.endsCareer ? "injury" : "normal",
  });

  if (stageId === "drafted") {
    startCareerFromDraft(result);
  }

  if (!silent) {
    saveState();
    render();

    showResultModal(stage, result, stageId);
  }
}

function startCareerFromDraft(draftedResult) {
  const isUndrafted = draftedResult.pickRange === "Undrafted" || draftedResult.id === "drafted_undrafted" || !draftedResult.team;

  state.career.started = true;
  state.career.completed = false;
  state.career.seasonNumber = 1;
  state.career.originalTeam = isUndrafted ? null : draftedResult.team || null;
  state.career.currentTeam = isUndrafted ? "Unsigned" : draftedResult.team || null;
  state.career.lastSignedTeam = isUndrafted ? null : draftedResult.team || null;
  state.career.teams = !isUndrafted && draftedResult.team ? [draftedResult.team] : [];
  state.career.pendingSeason = createPendingSeason(1);
  state.endingType = null;

  if (isUndrafted) {
    state.career.currentStage = "career_comeback";
  } else {
    state.career.currentStage = "career_points";
  }
}





function recordCareerResult(stageId, option, source, silent = false) {
  const stage = getStageDefinition(stageId);
  const result = shapeCareerResult(stageId, option, source);

  if (stageId === "career_points") {
    handleCareerPoints(option, result);
  } else if (stageId === "career_rebounds") {
    state.career.pendingSeason.rpg = option.value;
    state.career.currentStage = "career_assists";
  } else if (stageId === "career_assists") {
    state.career.pendingSeason.apg = option.value;
    state.career.currentStage = "career_defense";
  } else if (stageId === "career_defense") {
    state.career.pendingSeason.defense = option.label;
    state.career.pendingSeason.defenseImpact = option.impact;
    completeSeasonFromStats();
  } else if (stageId === "career_playoffs_entry") {
    handlePlayoffsEntry(option, result);
  } else if (stageId === "career_playin") {
    handlePlayIn(option, result);
  } else if (stageId === "career_playoff_round") {
    handlePlayoffRound(option, result);
  } else if (stageId === "career_finals_game") {
    handleFinalsGame(option, result);
  } else if (stageId === "career_awards") {
    handleAwards(option, result);
  } else if (stageId === "career_endseason") {
    handleEndSeasonDecision(option, result);
  } else if (stageId === "career_movement") {
    handleMovement(option, result);
  } else if (stageId === "career_offcourt") {
    handleOffCourtImpact(option, result);
  } else if (stageId === "career_training") {
    handleTrainingFocus(option, result);
  } else if (stageId === "career_comeback") {
    handleComeback(option, result);
  } else if (stageId === "career_team_spin") {
    handleTeamSpin(option, result);
  }

  state.log.unshift({
    stageName: stage.name,
    title: result.headline || result.label,
    extra: result.logExtra || result.copy || "Result locked.",
    type: result.endsCareer ? "injury" : result.type || "normal",
  });

  if (!silent) {
    saveState();
    render();

    showResultModal(stage, result, stageId);
  }
}


function handleCareerPoints(option, result) {
  if (option.kind === "career_injury") {
    const injuryType = getRandomCareerEndingInjury();
    state.career.endingReason = `Career-ending injury in Season ${state.career.seasonNumber}: ${injuryType}`;
    result.label = injuryType;
    result.headline = injuryType;
    result.injuryName = injuryType;
    result.copy = `${injuryType}. The career ends immediately and the final résumé moves into what-could-have-been territory.`;
    result.pills = [`Season ${state.career.seasonNumber}`, "Career-Ending Injury", injuryType];
    result.endsCareer = true;
    state.career.completed = true;
    state.completed = true;
    state.endingType = "nba_injury";
    return;
  }

  if (option.kind === "waived") {
    state.career.pendingSeason.waived = true;
    state.career.currentTeam = "Unsigned";
    state.career.currentStage = "career_comeback";
    return;
  }

  if (option.kind === "retirement") {
    state.career.endingReason = `Retired before Season ${state.career.seasonNumber}`;
    if (state.career.seasons.some((season) => !season.nonNbaSeason)) {
      state.career.currentStage = "career_legacy";
    } else {
      state.career.completed = true;
      state.completed = true;
      state.endingType = "retirement";
    }
    return;
  }

  state.career.pendingSeason.ppg = option.value;
  state.career.currentStage = "career_rebounds";
}

function getRandomCareerEndingInjury() {
  return careerEndingInjuries[Math.floor(Math.random() * careerEndingInjuries.length)];
}



function handleAwards(option, result) {
  const season = getCurrentSeasonRecord();
  if (!season) {
    state.career.currentStage = "career_endseason";
    return;
  }

  const check = getCurrentAwardCheck();
  if (!check) {
    state.career.currentStage = "career_endseason";
    return;
  }

  // Remove the current award check from the queue.
  season.awardQueue.shift();

  if (option.awardResult === "yes") {
    addAwardToCareerAndSeason(check.type, check.label, season);

    const boostReward = getAwardSpinBoostReward(check.type);
    if (boostReward) {
      addBonusSpin(check.label, boostReward);
      result.copy = `${result.copy || `You win ${check.label}.`}${formatSpinBoostReward(boostReward)}`;
    }

    // Rule: MVP automatically brings All-NBA First Team.
    if (check.type === "mvp") {
      addAwardToCareerAndSeason("allNbaFirst", "All-NBA First Team", season);
      season.awardQueue = season.awardQueue.filter((item) => item.type !== "allNbaFirst" && item.type !== "allNba");
      result.copy = `You win MVP. All-NBA First Team is automatically added to the résumé.${formatSpinBoostReward(boostReward)}`;
    }

    // Rule: First Team blocks 2nd/3rd Team.
    if (check.type === "allNbaFirst") {
      season.awardQueue = season.awardQueue.filter((item) => item.type !== "allNba");
    }
  }

  if (season.awardQueue.length) {
    state.career.currentStage = "career_awards";
  } else {
    delete season.awardQueue;
    state.career.currentStage = "career_endseason";
  }
}



function addAwardToCareerAndSeason(key, label, season) {
  if (!key || !state.career.awards[key]) {
    if (key && state.career.awards[key] === 0) {
      // existing zero count is valid
    } else if (key && !(key in state.career.awards)) {
      return;
    }
  }

  if (key) {
    state.career.awards[key] += 1;
  }

  if (!season.awards) season.awards = [];
  if (!season.awards.includes(label)) {
    season.awards.push(label);
  }
}




function handleEndSeasonDecision(option, result) {
  const season = state.career.seasons[state.career.seasons.length - 1];

  if (season) {
    season.endSeasonDecision = option.label;
  }

  if (option.decision === "waived") {
    state.career.currentTeam = "Unsigned";
    advanceCareerSeason("career_comeback");
    return;
  }

  state.career.currentStage = "career_movement";
}


function handleTeamSpin(option, result) {
  const team = option.team || option.label;
  state.career.currentTeam = team;
  state.career.lastSignedTeam = team;
  state.career.teams.push(team);

  state.career.pendingSeason = state.career.pendingSeason || createPendingSeason(state.career.seasonNumber);
  state.career.pendingSeason.team = team;
  state.career.pendingSeason.waiverResolved = true;

  result.team = team;
  result.teamCalloutLabel = "Signed By";
  result.copy = `${team} sign you. The season stats path resumes.`;

  state.career.currentStage = "career_points";
}







function handlePlayoffsEntry(option, result) {
  const season = getCurrentSeasonRecord();
  const playoffs = ensurePlayoffState(season);

  season.teamPerformance = option.label;
  playoffs.status = option.label;

  if (option.performance === "miss") {
    season.teamPerformance = "Missed Playoffs";
    updateBestPlayoffFinish("Missed Playoffs");
    state.career.currentStage = getAfterTeamPerformanceStage();
    return;
  }

  if (option.performance === "playin") {
    season.teamPerformance = "Play-In";
    state.career.currentStage = "career_playin";
    return;
  }

  markPlayoffAppearance(season);
  season.teamPerformance = "Made Playoffs";
  playoffs.currentRound = "First Round";
  updateBestPlayoffFinish("First Round Exit");
  state.career.currentStage = "career_playoff_round";
}

function handlePlayIn(option, result) {
  const season = getCurrentSeasonRecord();
  const playoffs = ensurePlayoffState(season);

  if (option.playin === "out") {
    season.teamPerformance = "Play-In Exit";
    playoffs.status = "Play-In Exit";
    updateBestPlayoffFinish("Play-In Exit");
    state.career.currentStage = getAfterTeamPerformanceStage();
    return;
  }

  markPlayoffAppearance(season);
  season.teamPerformance = "Made Playoffs via Play-In";
  playoffs.status = "Made Playoffs via Play-In";
  playoffs.currentRound = "First Round";
  updateBestPlayoffFinish("First Round Exit");
  state.career.currentStage = "career_playoff_round";
}

function handlePlayoffRound(option, result) {
  const season = getCurrentSeasonRecord();
  const playoffs = ensurePlayoffState(season);
  const round = playoffs.currentRound || "First Round";

  if (round === "Conference Finals") {
    markConferenceFinals(season);
  }

  if (option.roundResult === "eliminated") {
    const finish = `${round} Exit`;
    season.teamPerformance = finish;
    playoffs.status = finish;
    updateBestPlayoffFinish(round === "Conference Finals" ? "Conference Finals" : finish);
    state.career.currentStage = getAfterTeamPerformanceStage();
    return;
  }

  if (round === "First Round") {
    playoffs.currentRound = "Conference Semi Finals";
    season.teamPerformance = "Conference Semi Finals";
    updateBestPlayoffFinish("Conference Semi Finals Exit");
    state.career.currentStage = "career_playoff_round";
    return;
  }

  if (round === "Conference Semi Finals") {
    playoffs.currentRound = "Conference Finals";
    season.teamPerformance = "Conference Finals";
    markConferenceFinals(season);
    updateBestPlayoffFinish("Conference Finals");
    state.career.currentStage = "career_playoff_round";
    return;
  }

  if (round === "Conference Finals") {
    markFinalsAppearance(season);
    playoffs.status = "NBA Finals";
    playoffs.finalsGame = 1;
    playoffs.finalsWins = 0;
    playoffs.finalsLosses = 0;
    playoffs.games = [];
    playoffs.homeCourtAdvantage = Math.random() < 0.5;
    season.teamPerformance = "NBA Finals";
    updateBestPlayoffFinish("NBA Finals Loss");
    state.career.currentStage = "career_finals_game";
  }
}

function handleFinalsGame(option, result) {
  const season = getCurrentSeasonRecord();
  const playoffs = ensurePlayoffState(season);
  const game = playoffs.finalsGame || 1;
  const location = option.location || getFinalsGameLocation(playoffs.homeCourtAdvantage, game);

  playoffs.games.push({ game, result: option.finalsResult, location });

  if (option.finalsResult === "win") {
    playoffs.finalsWins += 1;
    state.career.playoffStats.finalsGameWins += 1;
  } else {
    playoffs.finalsLosses += 1;
    state.career.playoffStats.finalsGameLosses += 1;
  }

  result.copy = `Finals Game ${game} (${location}). Series: ${playoffs.finalsWins}-${playoffs.finalsLosses}.`;

  if (playoffs.finalsWins >= 4) {
    season.teamPerformance = "NBA Champion";
    playoffs.status = "NBA Champion";
    state.career.playoffStats.championships += 1;
    addBonusSpin("NBA Championship", 3);
    result.copy = `${result.copy} Championship won. +3 Spin Boosts earned.`;
    updateBestPlayoffFinish("NBA Champion");
    state.career.currentStage = getAfterTeamPerformanceStage();
    return;
  }

  if (playoffs.finalsLosses >= 4) {
    season.teamPerformance = "NBA Finals Loss";
    playoffs.status = "NBA Finals Loss";
    updateBestPlayoffFinish("NBA Finals Loss");
    state.career.currentStage = getAfterTeamPerformanceStage();
    return;
  }

  playoffs.finalsGame += 1;
  state.career.currentStage = "career_finals_game";
}

function shouldRunOffCourtImpact() {
  return state.career.seasonNumber > 0 && state.career.seasonNumber % 2 === 0;
}





function finishSeasonAfterMovement(nextStage = "career_points") {
  state.career.pendingAdvanceStage = nextStage;

  if (shouldRunOffCourtImpact()) {
    state.career.currentStage = "career_offcourt";
    return;
  }

  state.career.currentStage = "career_training";
}



function handleOffCourtImpact(option, result) {
  state.career.offCourtHistory.push({
    season: state.career.seasonNumber,
    result: option.summaryLabel || option.wheelLabel || option.label,
    fullResult: option.label,
    type: option.type || "neutral",
  });

  if (option.id && option.id !== "offcourt_quiet") {
    state.career.offCourtUsedIds = state.career.offCourtUsedIds || [];
    if (!state.career.offCourtUsedIds.includes(option.id)) {
      state.career.offCourtUsedIds.push(option.id);
    }
  }

  const boostChange = adjustSpinBoosts(Number(option.spinBoostChange || 0), option.summaryLabel || option.label);
  if (boostChange) {
    result.copy = `${result.copy} ${boostChange > 0 ? "+" : ""}${boostChange} Spin Boost${Math.abs(boostChange) === 1 ? "" : "s"}.`;
  } else if (option.spinBoostChange < 0) {
    result.copy = `${result.copy} You have no Spin Boosts to lose.`;
  }

  if (option.endsCareer) {
    state.career.legacyBoost += Number(option.legacyShift || 0);
    state.career.endingReason = `Career ended by betting scandal after Season ${state.career.seasonNumber}`;
    state.endingType = "betting_scandal";
    result.endsCareer = true;
    completeCareerWithCalculatedLegacy();
    return;
  }

  state.career.nextSeasonStatShift += Number(option.statShift || 0);
  state.career.nextSeasonRiskShift += Number(option.riskShift || 0);
  state.career.legacyBoost += Number(option.legacyShift || 0);

  if (option.forceTrainingFocus) {
    const forced = getTrainingFocusById(option.forceTrainingFocus);
    state.career.forcedTrainingFocus = forced;
    applyTrainingFocus(forced);
    result.copy = `${result.copy} Training Focus is forced to Focus on Cancun.`;
    const nextStage = state.career.pendingAdvanceStage || "career_points";
    state.career.pendingAdvanceStage = null;
    state.career.forcedTrainingFocus = null;
    advanceCareerSeason(nextStage);
    return;
  }

  state.career.currentStage = "career_training";
}

function handleTrainingFocus(option, result) {
  applyTrainingFocus(option);
  const nextStage = state.career.pendingAdvanceStage || "career_points";
  state.career.pendingAdvanceStage = null;
  advanceCareerSeason(nextStage);
}





function handleMovement(option, result) {
  const currentTeam = state.career.currentTeam && state.career.currentTeam !== "Unsigned"
    ? state.career.currentTeam
    : state.career.lastSignedTeam;

  if (option.movement === "retirement") {
    state.career.endingReason = `Retired after Season ${state.career.seasonNumber}`;
    state.career.currentStage = "career_legacy";
    return;
  }

  if (option.movement === "trade") {
    const nextTeam = randomTeam(currentTeam);
    result.team = nextTeam;
    result.teamCalloutLabel = "Traded To";
    result.copy = `${option.copy} New team: ${nextTeam}.`;
    state.career.currentTeam = nextTeam;
    state.career.lastSignedTeam = nextTeam;
    state.career.teams.push(nextTeam);
    state.career.movementHistory.push({
      season: state.career.seasonNumber,
      movement: option.label,
      team: nextTeam,
    });
    finishSeasonAfterMovement("career_points");
    return;
  }

  if (option.movement === "freeAgency") {
    state.career.currentTeam = "Unsigned";
    result.team = null;
    result.teamCalloutLabel = null;
    result.copy = "Free agency opens. The next spin decides who signs you.";
    state.career.movementHistory.push({
      season: state.career.seasonNumber,
      movement: option.label,
      team: "Free Agent",
    });
    finishSeasonAfterMovement("career_team_spin");
    return;
  }

  result.team = currentTeam || null;
  result.teamCalloutLabel = currentTeam ? "Stays With" : null;
  state.career.movementHistory.push({
    season: state.career.seasonNumber,
    movement: option.label,
    team: currentTeam || "Unsigned",
  });

  finishSeasonAfterMovement("career_points");
}








function handleComeback(option, result) {
  state.career.comebackHistory.push({
    season: state.career.seasonNumber,
    result: option.label,
  });

  if (option.resolution === "resume") {
    state.career.currentTeam = "Unsigned";
    state.career.pendingSeason = state.career.pendingSeason || createPendingSeason(state.career.seasonNumber);
    state.career.pendingSeason.team = "Unsigned";
    state.career.pendingSeason.comebackTag = option.label;
    state.career.pendingSeason.waiverResolved = true;
    state.career.currentStage = "career_team_spin";
    result.copy = `${option.copy} Spin for the NBA team that signs you next.`;
    return;
  }

  if (option.resolution === "skipYear") {
    state.career.seasons.push({
      season: state.career.seasonNumber,
      team: state.career.currentTeam || "Unsigned",
      status: option.label,
      ppg: 0,
      rpg: 0,
      apg: 0,
      defense: option.label,
      defenseImpact: 0,
      resultTier: option.label,
      score: 0,
      awards: [],
      nonNbaSeason: true,
    });
    state.career.currentTeam = "Unsigned";
    advanceCareerSeason("career_comeback");
    return;
  }

  if (option.resolution === "retire") {
    state.career.endingReason = `Retired during comeback attempt before Season ${state.career.seasonNumber}`;
    if (state.career.seasons.some((season) => !season.nonNbaSeason)) {
      state.career.currentStage = "career_legacy";
    } else {
      state.career.completed = true;
      state.completed = true;
      state.endingType = "retirement";
    }
    return;
  }

  if (option.resolution === "end") {
    state.career.endingReason = `No NBA return after Season ${state.career.seasonNumber}`;
    if (state.career.seasons.some((season) => !season.nonNbaSeason)) {
      state.career.currentStage = "career_legacy";
    } else {
      state.career.completed = true;
      state.completed = true;
      state.endingType = "out_of_league";
    }
  }
}

function completeSeasonFromStats() {
  const season = state.career.pendingSeason;
  const score = calculateSeasonScore(season);
  const tier = deriveSeasonTier(score, season);

  season.resultTier = tier;
  season.score = score;
  season.team = state.career.currentTeam || season.team || "Unsigned";
  season.awards = season.awards || [];
  season.playoffs = {
    status: "Pending",
    currentRound: null,
    homeCourtAdvantage: false,
    finalsGame: 1,
    finalsWins: 0,
    finalsLosses: 0,
    games: [],
  };

  state.career.seasons.push({ ...season });

  state.career.currentStage = "career_playoffs_entry";
}


function calculateSeasonScore(season) {
  return Number((season.ppg * 2 + season.rpg * 1.2 + season.apg * 1.55 + season.defenseImpact).toFixed(1));
}

function deriveSeasonTier(score, season) {
  if (score >= 115) return "Historic / GOAT-Level Season";
  if (score >= 95) return "MVP-Calibre Season";
  if (score >= 78) return "Superstar Season";
  if (score >= 62) return "All-Star Season";
  if (score >= 48) return "High-End Starter Season";
  if (score >= 35) return "Quality Starter Season";
  if (score >= 24) return "Rotation Season";
  if (score >= 14) return "Bench / Fringe Season";
  return "Barely Played";
}

function advanceCareerSeason(nextStage = "career_points") {
  if (state.career.seasonNumber >= state.career.maxSeasons) {
    state.career.currentStage = "career_legacy";
    state.career.pendingSeason = null;
    return;
  }

  state.career.seasonNumber += 1;
  state.career.pendingSeason = createPendingSeason(state.career.seasonNumber);
  state.career.currentStage = nextStage;
}


function applyEffects(effects) {
  for (const [key, value] of Object.entries(effects)) {
    if (state.profile[key] === undefined) continue;
    state.profile[key] += Number(value || 0);
  }

  state.profile.draftStock = clamp(state.profile.draftStock, 0, 160);
  state.profile.collegePrestige = clamp(state.profile.collegePrestige, 0, 60);
  state.profile.collegePerformance = clamp(state.profile.collegePerformance, -40, 130);
  state.profile.mediaHype = clamp(state.profile.mediaHype, -40, 130);
  state.profile.medicalRisk = clamp(state.profile.medicalRisk, 0, 100);
  state.profile.combineBoost = clamp(state.profile.combineBoost, -30, 80);
  state.profile.roleReadiness = clamp(state.profile.roleReadiness, -30, 80);
}

function shapeResult(stageId, option, source) {
  if (stageId === "position") {
    return {
      id: option.id,
      label: option.label,
      summaryLabel: option.wheelLabel,
      copy: option.copy,
      pills: [option.wheelLabel, source === "pick" ? "Manual Pick" : "Wheel Spin"],
      logExtra: option.copy,
    };
  }

  if (stageId === "height") {
    const inches = option.inches;
    const display = inchesToHeight(inches);
    return {
      id: option.id,
      label: display,
      sourceLabel: option.label,
      inches,
      copy: `Official measurement: ${display}. The build just got interesting.`,
      pills: ["Measured", display, state.results.position?.summaryLabel || state.results.position?.label || "Position"],
      logExtra: `Measured at ${display}.`,
    };
  }

  if (stageId === "wingspan") {
    const heightResult = state.results.height;
    const extra = randomInteger(option.minExtra, option.maxExtra);
    const heightInches = heightResult?.inches || 78;
    const wingspanInches = Math.max(60, heightInches + extra);
    const display = inchesToHeight(wingspanInches);
    const modifier = extra >= 0 ? `+${extra}` : `${extra}`;

    return {
      id: option.id,
      label: display,
      category: option.label,
      extra,
      copy: `${option.label}. Official wingspan: ${display} (${modifier} inches vs height).`,
      pills: [option.label, display, `${modifier} inches`],
      logExtra: `${display} wingspan (${modifier} inches).`,
    };
  }

  if (stageId === "seniorNight") {
    const box = `${option.points} PTS / ${option.rebounds} REB / ${option.assists} AST`;
    return {
      id: option.id,
      label: box,
      headline: option.label,
      points: option.points,
      rebounds: option.rebounds,
      assists: option.assists,
      copy: option.copy,
      pills: [`${option.points} PTS`, `${option.rebounds} REB`, `${option.assists} AST`],
      logExtra: option.copy,
    };
  }

  if (stageId === "collegeRecruitment") {
    return {
      id: option.id,
      label: option.label,
      pool: option.pool,
      copy: option.copy,
      pills: [option.label],
      logExtra: option.copy,
    };
  }

  if (stageId === "collegeSelection") {
    return {
      id: option.id,
      label: option.label,
      summaryLabel: option.label,
      college: option.label,
      pool: option.pool,
      copy: option.copy,
      pills: [option.label, poolSettings[option.pool]?.label || "College Offer"],
      logExtra: option.copy,
    };
  }

  if (collegeYearStages.includes(stageId)) {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [
        option.declareForDraft ? "Declare For Draft" : "College Season",
        option.endsCareer ? "Career Over" : "Result Locked"
      ],
      logExtra: option.copy,
      endsCareer: Boolean(option.endsCareer),
    };
  }

  if (stageId === "combine") {
    return {
      id: option.id,
      label: option.label,
      athletic: option.athletic,
      shooting: option.shooting,
      interview: option.interview,
      medical: option.medical,
      copy: option.copy,
      pills: [`Athletic: ${option.athletic}`, `Shooting: ${option.shooting}`, `Medical: ${option.medical}`],
      logExtra: option.copy,
    };
  }

  if (stageId === "mockDraft") {
    return {
      id: option.id,
      label: option.label,
      pickRange: option.pickRange,
      copy: option.copy,
      pills: [`Range: ${option.pickRange}`],
      logExtra: option.copy,
    };
  }

  if (stageId === "draftLottery") {
    return {
      id: option.id,
      label: option.label,
      movement: option.movement,
      copy: option.copy,
      pills: [`Board Movement: ${option.movement}`],
      logExtra: option.copy,
    };
  }

  if (stageId === "drafted") {
    const isUndrafted = option.pickRange === "Undrafted" || option.id === "drafted_undrafted";
    const team = isUndrafted ? null : randomChoice(nbaTeams);
    const copy = isUndrafted
      ? "No team makes the call on draft night. The path starts as an undrafted free agent fighting for a roster spot."
      : `${option.copy} ${team} make the call. Your background, team file and rookie season now belong to ${team}.`;

    return {
      id: option.id,
      label: option.label,
      pickRange: option.pickRange,
      team,
      copy,
      teamCalloutLabel: isUndrafted ? null : "Drafted By",
      pills: isUndrafted ? ["Undrafted", "No Team Assigned"] : [`Pick: ${option.pickRange}`, team],
      logExtra: isUndrafted ? "Undrafted. No team assigned." : `${team} make the call and draft you as a ${option.label}.`,
    };
  }

  return { ...option, copy: option.copy || "Result locked.", pills: [] };
}



function shapeCareerResult(stageId, option, source) {
  const season = state.career.seasonNumber;

  if (stageId === "career_points" && option.kind === "career_injury") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [`Season ${season}`, "Career Over"],
      endsCareer: true,
      type: "injury",
    };
  }

  if (stageId === "career_points" && option.kind === "waived") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [`Season ${season}`, "Comeback Spin Triggered"],
      type: "waived",
    };
  }

  if (stageId === "career_points" && option.kind === "retirement") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [`Season ${season}`, "Retirement"],
      type: "retirement",
    };
  }

  if (stageId === "career_points") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [`Season ${season}`, option.label],
      logExtra: `Season ${season}: ${option.label}`,
    };
  }

  if (stageId === "career_rebounds" || stageId === "career_assists" || stageId === "career_defense") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [`Season ${season}`, option.label],
      logExtra: `Season ${season}: ${option.label}`,
    };
  }

  if (stageId === "career_playoffs_entry" || stageId === "career_playin" || stageId === "career_playoff_round" || stageId === "career_finals_game") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [`Season ${season}`, option.label],
      logExtra: option.copy,
    };
  }

  if (stageId === "career_awards") {
    return {
      id: option.id,
      label: option.awardResult === "yes" ? option.awardLabel : `No ${option.awardLabel}`,
      copy: option.copy,
      pills: [`Season ${season}`, option.awardLabel, option.awardResult === "yes" ? "Won" : "Not Won"],
      logExtra: option.copy,
    };
  }

  if (stageId === "career_endseason") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [`Season ${season}`, option.label],
      type: option.decision === "waived" ? "waived" : "normal",
      logExtra: option.copy,
    };
  }

  if (stageId === "career_movement") {
    const teamCalloutLabel = option.movement === "trade" ? "Traded To" : null;

    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      teamCalloutLabel,
      pills: [`Season ${season}`, option.label],
      logExtra: option.copy,
    };
  }

  if (stageId === "career_offcourt") {
    const boostText = option.spinBoostChange
      ? `${option.spinBoostChange > 0 ? "+" : ""}${option.spinBoostChange} Spin Boost`
      : "No Spin Boost change";

    return {
      id: option.id,
      label: option.summaryLabel || option.wheelLabel || option.label,
      copy: option.copy,
      pills: [`Season ${season}`, option.summaryLabel || option.wheelLabel || option.label, boostText],
      type: option.endsCareer ? "injury" : "normal",
      logExtra: option.copy,
    };
  }

  if (stageId === "career_training") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [`Season ${season}`, "Training Focus", option.label],
      logExtra: option.copy,
    };
  }

  if (stageId === "career_comeback") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      pills: [`Season ${season}`, option.label],
      logExtra: option.copy,
    };
  }

  if (stageId === "career_team_spin") {
    return {
      id: option.id,
      label: option.label,
      copy: option.copy,
      teamCalloutLabel: "Signed By",
      pills: [`Season ${season}`, "NBA Team", option.label],
      logExtra: option.copy,
    };
  }

  return { ...option, copy: option.copy || "Result locked.", pills: [] };
}



function showResultModal(stage, result, completedStageId = null) {
  elements.modalKicker.textContent = `${stage.shortName} Result`;
  elements.modalTitle.textContent = result.headline || result.label;

  const teamLabel = result.teamCalloutLabel || (result.team ? "Team Update" : "");
  const teamCallout = result.team ? `
    <div class="team-result-callout">
      <span>${escapeHtml(teamLabel)}</span>
      <strong>${escapeHtml(result.team)}</strong>
    </div>
  ` : "";

  const copyHtml = result.allowHtmlCopy ? result.copy : escapeHtml(result.copy || "Result locked.");
  elements.modalCopy.innerHTML = `${teamCallout}<span>${copyHtml}</span>`;
  elements.modalPills.innerHTML = renderPills(result.pills);

  const canReSpin = canUseBonusReSpin();
  if (elements.bonusReSpinButton) {
    elements.bonusReSpinButton.classList.toggle("hidden", !canReSpin);
    elements.bonusReSpinButton.textContent = canReSpin ? `Use Re-Spin (${getBonusCount()} Spin Boost${getBonusCount() === 1 ? "" : "s"} left)` : "Use Re-Spin";
  }

  if (completedStageId === "position") {
    forceSpinBoostInfoAfterResult = true;
  }

  elements.resultModal.classList.remove("hidden");
  showInjuryReveal(result);
}

function canUseBonusReSpin() {
  return Boolean(lastSpinSnapshot && lastSpinStageId && getBonusCount() > 0 && isBonusEligible(lastSpinStageId));
}

function useBonusReSpin() {
  if (!canUseBonusReSpin() || isSpinning) return;

  const snapshot = JSON.parse(lastSpinSnapshot);
  state = normaliseState(snapshot);

  // A re-spin spends one Spin Boost as a mulligan only.
  // It does not activate boosted board, otherwise it becomes both a re-spin and a boost.
  state.bonus.count = Math.max(0, getBonusCount() - 1);
  clearBonusActive();

  elements.resultModal.classList.add("hidden");
  saveState();
  render();

  setTimeout(() => {
    spinStage(lastSpinStageId);
  }, 80);
}











function showInjuryReveal(result) {
  if (!result?.injuryName || !elements.injuryModal) return;

  elements.injuryModalTitle.textContent = "Career Ending Injury";
  elements.injuryModalCopy.textContent = result.injuryName;
  elements.injuryModal.classList.remove("hidden");
}

function closeInjuryReveal() {
  elements.injuryModal?.classList.add("hidden");
}

function openBoostInfoModal() {
  const modal = elements.boostInfoModal || document.getElementById("boostInfoModal");
  modal?.classList.remove("hidden");
}





function maybeShowSpinBoostInfo() {
  state.bonus = state.bonus || { count: 3, active: false, activeStageId: null, earnedLog: [], introShown: true, infoSeen: false };
  if (!state.bonus.infoSeen && state.log?.length >= 1) {
    state.bonus.infoSeen = true;
    saveState();
    setTimeout(openBoostInfoModal, 220);
  }
}



function closeBoostInfoModal() {
  const modal = elements.boostInfoModal || document.getElementById("boostInfoModal");
  modal?.classList.add("hidden");
}





function shouldOpenMandatoryBoostInfo() {
  return Boolean(state.bonus?.mandatoryInfoPending && !state.bonus?.mandatoryInfoShown);
}

function queueMandatoryBoostInfoAfterPosition() {
  state.bonus = state.bonus || { count: 3, active: false, activeStageId: null, earnedLog: [], introShown: true };
  state.bonus.mandatoryInfoPending = true;
}

function openMandatoryBoostInfoIfQueued() {
  if (!shouldOpenMandatoryBoostInfo()) return;
  state.bonus.mandatoryInfoPending = false;
  state.bonus.mandatoryInfoShown = true;
  state.bonus.infoSeen = true;
  saveState();
  setTimeout(openBoostInfoModal, 120);
}

function maybeOpenPendingBoostInfo() {
  if (state.bonus?.pendingInfoAfterPosition && !state.bonus?.infoSeen) {
    state.bonus.pendingInfoAfterPosition = false;
    state.bonus.infoSeen = true;
    saveState();
    setTimeout(openBoostInfoModal, 120);
  }
}

function closeModal(skipFinal = false) {
  const mustShowSpinBoostInfo = Boolean(forceSpinBoostInfoAfterResult);
  forceSpinBoostInfoAfterResult = false;
  pendingPositionBoostInfoModal = false;

  elements.resultModal.classList.add("hidden");

  if (mustShowSpinBoostInfo) {
    setTimeout(openBoostInfoModal, 120);
    return;
  }

  if (!skipFinal && state.completed) {
    showFinalProspectModal();
  }
}











function renderPills(pills = []) {
  return pills.filter(Boolean).map((pill) => `<span class="pill">${escapeHtml(String(pill))}</span>`).join("");
}

function getSeasonPillClass(label) {
  const text = String(label || "").toLowerCase();
  if (text.includes("champ")) return "gold";
  if (text.includes("dpoy") || text.includes("defensive player")) return "defense";
  if (text.includes("mvp") || text.includes("roy") || text.includes("scoring")) return "accent";
  if (text.includes("all-nba")) return "allnba";
  if (text.includes("all-rookie") || text.includes("all-star")) return "blue";
  if (text.includes("waived") || text.includes("injury") || text.includes("eliminated") || text.includes("miss")) return "red";
  if (text.includes("live")) return "neutral";
  return "neutral";
}

function renderTrackerPills(items = []) {
  return items.filter(Boolean).slice(0, 3).map((item) => `
    <span class="season-pill ${getSeasonPillClass(item)}">${escapeHtml(String(item))}</span>
  `).join("");
}

function renderLog() {
  const current = state.career?.pendingSeason;
  const completedSeasons = state.career?.seasons || [];
  const hasCompletedCurrent = current && completedSeasons.some((season) => Number(season.season) === Number(current.season));

  if (!state.career?.started && !completedSeasons.length) {
    elements.journeyLog.innerHTML = "";
    document.body.classList.add("tracker-empty");
    return;
  }

  document.body.classList.remove("tracker-empty");

  const currentStats = current ? [
    typeof current.ppg === "number" ? `${current.ppg.toFixed(1)} PPG` : null,
    typeof current.rpg === "number" ? `${current.rpg.toFixed(1)} RPG` : null,
    typeof current.apg === "number" ? `${current.apg.toFixed(1)} APG` : null,
  ].filter(Boolean).join(" • ") : "";

  const currentPills = renderTrackerPills([currentStats ? "Live season" : null]);

  const currentCard = state.career?.started && current && !state.career.completed && !hasCompletedCurrent ? `
    <div class="season-summary-card current">
      <div class="season-summary-top">
        <span class="season-summary-title">Season ${escapeHtml(current.season)}</span>
        ${renderTeamPill(state.career.currentTeam, "—")}
      </div>
      <div class="season-summary-stats">${escapeHtml(currentStats || "Season in progress")}</div>
      <div class="season-summary-pills">${currentPills}</div>
    </div>
  ` : "";

  const seasonCards = completedSeasons.slice().reverse().slice(0, 10).map((season) => {
    const pills = [];
    const seasonAwards = Array.isArray(season.awards) ? season.awards : [];
    const priorityAwards = seasonAwards.filter((award) =>
      /All-NBA|DPOY|Defensive Player/i.test(String(award))
    );
    const otherAwards = seasonAwards.filter((award) => !priorityAwards.includes(award));

    pills.push(...priorityAwards.slice(0, 3));

    for (const award of otherAwards) {
      if (pills.length >= 3) break;
      pills.push(award);
    }

    if (pills.length < 3 && season.teamPerformance) pills.push(season.teamPerformance);
    if (pills.length < 3 && season.resultTier) pills.push(season.resultTier);

    const statsLine = season.nonNbaSeason
      ? (season.status || "Non-NBA season")
      : `${Number(season.ppg || 0).toFixed(1)} PPG • ${Number(season.rpg || 0).toFixed(1)} RPG • ${Number(season.apg || 0).toFixed(1)} APG`;

    return `
      <div class="season-summary-card ${season.nonNbaSeason ? "non-nba" : ""}">
        <div class="season-summary-top">
          <span class="season-summary-title">Season ${escapeHtml(season.season)}</span>
          ${renderTeamPill(season.team, "—")}
        </div>
        <div class="season-summary-stats">${escapeHtml(statsLine)}</div>
        <div class="season-summary-pills">${renderTrackerPills(pills)}</div>
      </div>
    `;
  }).join("");

  elements.journeyLog.innerHTML = `
    <div class="season-summary-list">
      ${currentCard}
      ${seasonCards}
    </div>
  `;
}





function formatPendingStatLine(season) {
  const ppg = typeof season.ppg === "number" ? `${season.ppg.toFixed(1)} PPG` : "PPG pending";
  const rpg = typeof season.rpg === "number" ? `${season.rpg.toFixed(1)} RPG` : "RPG pending";
  const apg = typeof season.apg === "number" ? `${season.apg.toFixed(1)} APG` : "APG pending";
  const def = season.defense ? season.defense : "Defence pending";
  const focus = getCurrentTrainingFocusTag();

  return `${ppg} / ${rpg} / ${apg} / ${def}${focus ? ` / ${focus}` : ""}`;
}




function completeCareerWithCalculatedLegacy() {
  const breakdown = getCareerRatingBreakdown();
  state.career.rating = breakdown;
  state.career.legacy = getCalculatedLegacyFromRating(breakdown.rating);
  state.career.completed = true;
  state.completed = true;

  if (!state.endingType) {
    state.endingType = "legacy";
  }
}

function getCalculatedLegacyFromRating(rating) {
  const value = Number(rating || 0);
  if (value >= 95) return { id: "legacy_goat_candidate", label: "GOAT Candidate", wheelLabel: "GOAT", rating: value, copy: "The career belongs in impossible debate territory." };
  if (value >= 88) return { id: "legacy_all_time_great", label: "All-Time Great", wheelLabel: "ALL-TIME", rating: value, copy: "The résumé is all-time great level." };
  if (value >= 78) return { id: "legacy_hall_of_famer", label: "Hall of Famer", wheelLabel: "HOF", rating: value, copy: "The Hall of Fame call is not a debate." };
  if (value >= 65) return { id: "legacy_franchise_legend", label: "Franchise Legend", wheelLabel: "LEGEND", rating: value, copy: "Fans of the franchise will never forget it." };
  if (value >= 50) return { id: "legacy_star_career", label: "Star Career", wheelLabel: "STAR", rating: value, copy: "A star-level career with big moments and real résumé weight." };
  if (value >= 35) return { id: "legacy_solid_nba_career", label: "Solid NBA Career", wheelLabel: "SOLID", rating: value, copy: "A real NBA career with plenty to be proud of." };
  if (value >= 20) return { id: "legacy_role_player", label: "Role Player Career", wheelLabel: "ROLE", rating: value, copy: "The career found a role and stayed in the league." };
  if (value >= 10) return { id: "legacy_fringe", label: "Fringe NBA Career", wheelLabel: "FRINGE", rating: value, copy: "The league was reached, but the résumé stayed thin." };
  return { id: "legacy_barely_made", label: "Barely Made The League", wheelLabel: "BARELY", rating: value, copy: "The dream happened, but only just." };
}

function getCareerRatingBreakdown() {
  const totals = getCareerTotals();
  const seasons = state.career.seasons.filter((season) => !season.nonNbaSeason && typeof season.score === "number");
  const nbaSeasons = Number(totals.nbaSeasons || 0);
  const ppg = Number(totals.ppg || 0);
  const rpg = Number(totals.rpg || 0);
  const apg = Number(totals.apg || 0);
  const avgDef = seasons.length
    ? seasons.reduce((sum, season) => sum + Number(season.defenseImpact || 0), 0) / seasons.length
    : 0;

  const awards = state.career.awards || {};
  const playoff = state.career.playoffStats || {};
  const championships = Number(playoff.championships || 0);
  const mvps = Number(awards.mvp || 0);
  const allStars = Number(awards.allStar || 0);
  const allNbaFirst = Number(awards.allNbaFirst || 0);
  const allNba = Number(awards.allNba || 0);
  const scoringTitles = Number(awards.scoringTitle || 0);
  const dpoys = Number(awards.dpoy || 0);
  const roy = Number(awards.roy || 0);

  const statsScore = clamp(
    (ppg / 30) * 13 +
    (rpg / 10) * 5 +
    (apg / 10) * 5 +
    (Math.max(0, avgDef) / 30) * 5 +
    Math.min(ppg / 30, rpg / 10, apg / 10) * 2,
    0,
    30
  );

  const awardsScore = clamp(
    mvps * 2.8 +
    allNbaFirst * 1.2 +
    allNba * 0.8 +
    allStars * 0.45 +
    scoringTitles * 1.1 +
    dpoys * 1.1 +
    roy * 0.8,
    0,
    25
  );

  const teamScore = clamp(
    championships * 2.35 +
    Math.max(0, (playoff.finalsAppearances || 0) - championships) * 0.9 +
    (playoff.conferenceFinals || 0) * 0.35 +
    (playoff.playoffAppearances || 0) * 0.22,
    0,
    25
  );

  const longevityScore = clamp(nbaSeasons * 0.5, 0, 10);

  let offseasonScore = clamp(Number(state.career.legacyBoost || 0) / 4, -5, 5);
  if (state.endingType === "betting_scandal") offseasonScore -= 8;
  if (state.endingType === "nba_injury" && nbaSeasons <= 3) offseasonScore -= 2;
  offseasonScore = clamp(offseasonScore, -10, 5);

  const goatBonus = clamp(
    Math.max(0, championships - 3) * 0.75 +
    Math.max(0, mvps - 2) * 0.8 +
    Math.max(0, allStars - 8) * 0.18 +
    Math.max(0, scoringTitles - 2) * 0.22 +
    Math.max(0, dpoys - 1) * 0.22,
    0,
    12
  );

  let total = statsScore + awardsScore + teamScore + longevityScore + offseasonScore + goatBonus;

  if (nbaSeasons < 3 && !mvps && !championships) total = Math.min(total, 28);
  if (nbaSeasons < 5 && mvps < 1 && championships < 1) total = Math.min(total, 45);

  const rating = Math.round(clamp(total, 0, 100));

  return {
    rating,
    statsScore: Number(statsScore.toFixed(1)),
    awardsScore: Number(awardsScore.toFixed(1)),
    teamScore: Number(teamScore.toFixed(1)),
    longevityScore: Number(longevityScore.toFixed(1)),
    offseasonScore: Number(offseasonScore.toFixed(1)),
    goatBonus: Number(goatBonus.toFixed(1)),
    avgDefense: Number(avgDef.toFixed(1)),
  };
}



function getCareerRatingBreakdownForDisplay() {
  return state.career.rating || getCareerRatingBreakdown();
}

function renderRatingBreakdown(breakdown) {
  const rows = [
    ["Stats", breakdown.statsScore, 30],
    ["Awards", breakdown.awardsScore, 25],
    ["Winning", breakdown.teamScore, 25],
    ["Longevity", breakdown.longevityScore, 10],
  ];

  return `
    <div class="rating-breakdown">
      ${rows.map(([label, value, max]) => `
        <div class="rating-breakdown-row">
          <span>${escapeHtml(label)}</span>
          <div class="rating-breakdown-track">
            <div class="rating-breakdown-fill" style="width:${escapeHtml(String(clamp((Math.max(0, Number(value)) / max) * 100, 0, 100)))}%"></div>
          </div>
          <span>${escapeHtml(Number(value).toFixed(1))}</span>
        </div>
      `).join("")}
    </div>
  `;
}





function getFinalRows() {
  const rows = stageOrder.map((stageId) => {
    const stage = stages[stageId];
    const result = state.results[stageId];
    const skipped = getSkippedLabel(stageId);
    return [stage.shortName, result?.summaryLabel || result?.label || skipped || "Pending"];
  });

  if (state.career.started) {
    const totals = getCareerTotals();
    rows.push(["NBA Seasons", String(totals.nbaSeasons)]);
    rows.push(["Career Averages", totals.nbaSeasons ? `${totals.ppg} PPG / ${totals.rpg} RPG / ${totals.apg} APG` : "No NBA stats"]);
    rows.push(["Best Season", getBestSeasonLabel()]);
    rows.push(["Awards", getAwardsSummary() || "None"]);
    rows.push(["Teams", unique(state.career.teams).join(", ") || "Unsigned"]);
    rows.push(["Career Rating", `${getCareerRatingBreakdownForDisplay().rating}/100`]);
    rows.push(["Legacy", state.career.legacy?.label || getCalculatedLegacyFromRating(getCareerRatingBreakdownForDisplay().rating).label || "In Progress"]);
    rows.push(["Ending", state.career.endingReason || state.endingType || "Career Complete"]);
  }

  return rows;
}

function getDraftBadgeText() {
  const drafted = state.results.drafted;
  if (state.completed || state.career?.completed) return `${getCareerRatingBreakdownForDisplay().rating}/100`;
  if (state.endingType === "injury" || state.endingType === "nba_injury") return "INJURY";
  if (state.career.legacy) return state.career.legacy.wheelLabel || "LEGACY";
  if (!drafted) return "Pending";
  if (drafted.pickRange === "Undrafted") return "UDFA";
  if (["1", "2", "3", "4", "5"].includes(drafted.pickRange)) return `#${drafted.pickRange}`;
  return drafted.pickRange;
}




function getOffCourtSummaryText(limit = 4) {
  const history = state.career?.offCourtHistory || [];
  if (!history.length) return "No off-court moments yet";

  return history
    .slice(-limit)
    .reverse()
    .map((item) => `S${item.season}: ${item.result}`)
    .join(" / ");
}

function renderOffCourtChips(limit = 8) {
  const history = state.career?.offCourtHistory || [];
  if (!history.length) {
    return `<span class="offcourt-chip">No off-court moments</span>`;
  }

  return history
    .slice(-limit)
    .reverse()
    .map((item) => `<span class="offcourt-chip"><small>S${escapeHtml(item.season)}</small> ${escapeHtml(item.result)}</span>`)
    .join("");
}

function showFinalProspectModal() {
  if (state.completed && !state.career.legacy) {
    completeCareerWithCalculatedLegacy();
  }

  const injury = state.endingType === "injury" || state.endingType === "nba_injury";
  const drafted = state.results.drafted;
  const legacy = state.career.legacy;
  const totals = getCareerTotals();
  const ratingBreakdown = getCareerRatingBreakdownForDisplay();
  const data = getShareCardData();
  const headline = injury
    ? "Career Ending Injury"
    : legacy
      ? legacy.label
      : getCalculatedLegacyFromRating(ratingBreakdown.rating).label;

  if (!drafted && !injury) return;

  elements.finalModalKicker.textContent = injury ? "Career Over" : "Career Résumé";
  elements.finalModalTitle.textContent = injury ? "What Could Have Been" : "Career Complete";

  const ratingRows = [
    ["Stats", ratingBreakdown.statsScore || 0, 30],
    ["Awards", ratingBreakdown.awardsScore || 0, 25],
    ["Winning", ratingBreakdown.teamScore || 0, 25],
    ["Longevity", ratingBreakdown.longevityScore || 0, 10],
  ];

  const averageItems = [
    ["PPG", Number(totals.ppg || 0).toFixed(1)],
    ["RPG", Number(totals.rpg || 0).toFixed(1)],
    ["APG", Number(totals.apg || 0).toFixed(1)],
    ["DEF", `+${Math.round(Number(ratingBreakdown.avgDefense || 0))}`],
  ];

  elements.finalProspectCard.innerHTML = `
    <article class="v50-final-card">
      <header class="v50-final-hero ${injury ? "injury" : ""}">
        <div>
          <p class="v50-kicker">Career Résumé</p>
          <h3>${escapeHtml(state.playerName)}</h3>
          <span>${escapeHtml(`${data.seasons}-year career • ${headline}`)}</span>
          <small>${escapeHtml(data.draftLine)}</small>
        </div>
        <div class="v50-final-rating">
          <strong>${escapeHtml(String(ratingBreakdown.rating))}</strong>
          <span>/100</span>
        </div>
      </header>

      <section class="v50-final-section">
        <p class="v50-kicker">Rating Breakdown</p>
        ${ratingRows.map(([label, value, max]) => `
          <div class="v50-final-bar">
            <span>${escapeHtml(label)}</span>
            <i><b style="width:${escapeHtml(String(clamp((Number(value) / max) * 100, 0, 100)))}%"></b></i>
            <strong>${escapeHtml(`${Number(value || 0).toFixed(0)}/${max}`)}</strong>
          </div>
        `).join("")}
      </section>

      <section class="v50-final-section">
        <p class="v50-kicker">Achievements</p>
        <div class="v50-final-achievements">
          ${data.awards.map((item) => `
            <div><em>${escapeHtml(item.icon)}</em><span>${escapeHtml(item.label)}</span></div>
          `).join("")}
        </div>
      </section>

      <section class="v50-final-section v50-final-stats">
        <p class="v50-kicker">Career Averages</p>
        <div>
          ${averageItems.map(([label, value]) => `
            <div><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>
          `).join("")}
        </div>
      </section>

      <section class="v50-final-section">
        <p class="v50-kicker">Best Season</p>
        <p class="v50-best-season">${escapeHtml(data.bestSeason)}</p>
      </section>
    </article>
  `;

  closeModal(true);
  elements.finalModal.classList.remove("hidden");
}



function renderAverageBars(totals) {
  const values = [
    ["PPG", Number(totals.ppg || 0), 30],
    ["RPG", Number(totals.rpg || 0), 12],
    ["APG", Number(totals.apg || 0), 10],
  ];

  return `
    <div class="avg-bars">
      ${values.map(([label, value, max]) => `
        <div class="avg-row">
          <span>${label}</span>
          <div class="avg-track" title="${escapeHtml(label)} benchmark: ${escapeHtml(String(max))}">
            <div class="avg-fill" style="width:${escapeHtml(String(clamp((value / max) * 100, 0, 100)))}%"></div>
          </div>
          <span>${escapeHtml(value.toFixed(1))}</span>
        </div>
      `).join("")}
    </div>
  `;
}



function getAwardIconItems() {
  const awards = state.career.awards || {};
  const playoff = state.career.playoffStats || {};
  const items = [];

  if (playoff.championships) items.push({ icon: "🏆", label: `${playoff.championships}x Champion` });
  if (awards.mvp) items.push({ icon: "🏆", label: `${awards.mvp}x MVP` });
  if (awards.roy) items.push({ icon: "⭐", label: `${awards.roy}x ROY` });
  if (awards.allNbaFirst) items.push({ icon: "🥇", label: `${awards.allNbaFirst}x 1st` });
  if (awards.allNba) items.push({ icon: "🏅", label: `${awards.allNba}x All-NBA` });
  if (awards.allStar) items.push({ icon: "🌟", label: `${awards.allStar}x AS` });
  if (awards.scoringTitle) items.push({ icon: "🔥", label: `${awards.scoringTitle}x Score` });
  if (awards.dpoy) items.push({ icon: "🛡️", label: `${awards.dpoy}x DPOY` });

  return items.length ? items : [{ icon: "—", label: "No major achievements" }];
}



function renderAwardIcon(item) {
  return `
    <div class="award-icon">
      <span>${escapeHtml(item.icon)}</span>
      <small>${escapeHtml(`${item.count}x ${item.label}`)}</small>
    </div>
  `;
}


function getCareerTotals() {
  const countedSeasons = state.career.seasons.filter((season) => !season.nonNbaSeason && typeof season.ppg === "number");
  if (!countedSeasons.length) return { nbaSeasons: 0, ppg: "0.0", rpg: "0.0", apg: "0.0", defense: "0.0" };

  const avg = (key) => (countedSeasons.reduce((sum, season) => sum + Number(season[key] || 0), 0) / countedSeasons.length).toFixed(1);

  return {
    nbaSeasons: countedSeasons.length,
    ppg: avg("ppg"),
    rpg: avg("rpg"),
    apg: avg("apg"),
    defense: avg("defenseImpact"),
  };
}





function getBestSeasonLabel() {
  const seasons = state.career.seasons.filter((season) => !season.nonNbaSeason && typeof season.score === "number");
  if (!seasons.length) return "No NBA stats";
  const best = [...seasons].sort((a, b) => b.score - a.score)[0];
  const teamResult = best.teamPerformance ? `, ${best.teamPerformance}` : "";
  return `Season ${best.season}: ${best.resultTier}${teamResult} (${best.ppg} / ${best.rpg} / ${best.apg})`;
}


function getAwardsSummary() {
  const parts = [];
  const labels = {
    roy: "ROY",
    mvp: "MVP",
    allNbaFirst: "All-NBA 1st",
    allNba: "All-NBA 2nd/3rd",
    allStar: "All-Star",
    scoringTitle: "Scoring Title",
    dpoy: "Defensive Player of the Year",
  };

  for (const [key, label] of Object.entries(labels)) {
    const count = state.career.awards[key] || 0;
    if (count) parts.push(`${count}× ${label}`);
  }

  return parts.join(", ");
}

function getLegacyScore() {
  const totals = getCareerTotals();
  const seasons = state.career.seasons.filter((season) => !season.nonNbaSeason && typeof season.score === "number");
  const averageScore = seasons.length ? seasons.reduce((sum, season) => sum + season.score, 0) / seasons.length : 0;
  const bestScore = seasons.length ? Math.max(...seasons.map((season) => season.score)) : 0;
  const playoff = state.career.playoffStats || {};

  return (
    Number(totals.ppg) * 2.2 +
    Number(totals.rpg) * 1.4 +
    Number(totals.apg) * 1.6 +
    averageScore * 0.8 +
    bestScore * 0.9 +
    totals.nbaSeasons * 3 +
    (playoff.championships || 0) * 42 +
    (playoff.finalsAppearances || 0) * 18 +
    (playoff.conferenceFinals || 0) * 8 +
    (playoff.playoffAppearances || 0) * 3 +
    Number(state.career.legacyBoost || 0) +
    state.career.awards.roy * 12 +
    state.career.awards.mvp * 45 +
    state.career.awards.allNbaFirst * 24 +
    state.career.awards.allNba * 16 +
    state.career.awards.allStar * 8 +
    state.career.awards.scoringTitle * 10 +
    state.career.awards.dpoy * 12
  );
}


function unique(items) {
  return [...new Set(items.filter(Boolean))];
}


function skipToCareerEndForTesting() {
  destroyWheel();

  if (!state.results.drafted && !state.completed) {
    completePreCareerForTesting();
  }

  if (!state.career.started && state.results.drafted) {
    startCareerFromDraft(state.results.drafted);
  }

  if (!state.completed) {
    simulateCareerForTesting();
  }

  saveState();
  render();
  showFinalProspectModal();
}

function completePreCareerForTesting() {
  let guard = 0;

  while (!state.results.drafted && !state.completed && guard < 80) {
    const stageId = getCurrentStageId();
    if (!stageId || careerStageIds.has(stageId)) break;

    let options = getStageOptions(stageId);
    if (collegeYearStages.includes(stageId)) {
      options = options.filter((option) => !option.endsCareer);
    }

    if (!options.length) break;

    const { option } = pickWeighted(options);
    recordResult(stageId, option, "skip", true);
    guard += 1;
  }
}

function simulateCareerForTesting() {
  let guard = 0;

  while (!state.completed && guard < 500) {
    const stageId = getCurrentStageId();

    if (!stageId) break;

    if (!careerStageIds.has(stageId)) {
      const options = getStageOptions(stageId);
      const { option } = pickWeighted(options);
      recordResult(stageId, option, "skip", true);
      guard += 1;
      continue;
    }

    const options = getStageOptions(stageId);
    if (!options.length) break;

    const { option } = pickWeighted(options);
    recordCareerResult(stageId, option, "skip", true);
    guard += 1;
  }

  if (!state.completed && state.career.started) {
    completeCareerWithCalculatedLegacy();
  }
}



function closeFinalModal() {
  elements.finalModal.classList.add("hidden");
}

function resetState() {
  state = createInitialState();
  lastSpinSnapshot = null;
  lastSpinStageId = null;
  saveState();
  render();
  closeModal(true);
  closeFinalModal();
}




function getShareCardData() {
  const totals = getCareerTotals();
  const playoff = state.career.playoffStats || {};
  const drafted = state.results.drafted;
  const awards = getAwardIconItems();
  const bestSeason = getBestSeasonLabel();
  const offCourt = state.career.offCourtHistory || [];
  if (state.completed && !state.career.legacy) {
    completeCareerWithCalculatedLegacy();
  }

  const ratingBreakdown = getCareerRatingBreakdownForDisplay();
  const legacy = state.career.legacy?.label || state.career.endingReason || state.endingType || "Career Complete";
  const topSummary = String(state.career.endingReason || legacy || "").toLowerCase().includes("injur")
    ? "Career Ending Injury"
    : legacy;

  return {
    playerName: state.playerName || "Player",
    legacy,
    rating: ratingBreakdown.rating,
    topSummary,
    draftLine: drafted ? (drafted.team ? `${drafted.label} - ${drafted.team}` : `${drafted.label} - No team assigned`) : "Not drafted",
    seasons: totals.nbaSeasons || 0,
    ppg: Number(totals.ppg || 0),
    rpg: Number(totals.rpg || 0),
    apg: Number(totals.apg || 0),
    awards,
    championships: playoff.championships || 0,
    finals: playoff.finalsAppearances || 0,
    playoffs: playoff.playoffAppearances || 0,
    bestSeason,
    offCourt,
  };
}

function createCareerShareCanvas() {
  const data = getShareCardData();
  const canvas = document.createElement("canvas");
  const width = 1080;
  const height = 1350;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  const primary = getComputedStyle(document.body).getPropertyValue("--team-primary").trim() || "#009844";
  const secondary = getComputedStyle(document.body).getPropertyValue("--team-secondary").trim() || "#151313";
  const bg = "#050505";
  const panel = "#151313";
  const panel2 = "#242220";
  const line = "rgba(255,255,255,.14)";
  const text = "#ffffff";
  const muted = "rgba(255,255,255,.68)";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const grd = ctx.createRadialGradient(540, 100, 40, 540, 120, 770);
  grd.addColorStop(0, hexToRgba(primary, .34));
  grd.addColorStop(.46, "rgba(255,255,255,.035)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 70, 70, 940, 220, 28, panel, line, 2);
  drawText(ctx, "CAREER RÉSUMÉ", 105, 122, { size: 28, weight: "900", colour: primary, letterSpacing: 3 });
  const upperName = data.playerName.toUpperCase();
  drawText(ctx, upperName, 105, 198, {
    size: fitTextSize(ctx, upperName, 660, 74, "900"),
    weight: "900",
    colour: text,
    maxWidth: 660,
  });
  roundRect(ctx, 770, 112, 185, 122, 60, primary, primary, 0);
  drawText(ctx, "RATING", 862, 150, { size: 22, weight: "900", colour: text, align: "center" });
  drawText(ctx, `${data.rating}`, 848, 209, { size: 66, weight: "900", colour: text, align: "center" });
  drawText(ctx, "/100", 907, 211, { size: 24, weight: "900", colour: text });
  drawWrappedText(ctx, `${data.seasons}-year career • ${data.topSummary} • ${data.draftLine}`, 105, 248, 620, 28, {
    size: 23,
    weight: "800",
    colour: muted,
  });

  drawPanel(ctx, 70, 330, 940, 145, "RATING BREAKDOWN");
  const breakdown = getCareerRatingBreakdownForDisplay();
  const rows = [
    ["Stats", breakdown.statsScore || 0, 30],
    ["Awards", breakdown.awardsScore || 0, 25],
    ["Winning", breakdown.teamScore || 0, 25],
    ["Longevity", breakdown.longevityScore || 0, 10],
  ];
  rows.forEach((row, index) => {
    const [label, value, max] = row;
    const x = 105 + index * 225;
    drawText(ctx, label, x, 395, { size: 18, weight: "900", colour: muted });
    roundRect(ctx, x, 414, 165, 12, 6, "rgba(255,255,255,.14)", "rgba(255,255,255,.14)", 0);
    roundRect(ctx, x, 414, clamp((Number(value) / max) * 165, 0, 165), 12, 6, primary, primary, 0);
    drawText(ctx, `${Number(value || 0).toFixed(0)}/${max}`, x + 178, 425, { size: 18, weight: "900", colour: text });
  });

  drawPanel(ctx, 70, 515, 940, 250, "ACHIEVEMENTS");
  data.awards.slice(0, 8).forEach((item, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = 105 + col * 225;
    const y = 585 + row * 78;
    roundRect(ctx, x, y, 185, 58, 12, panel2, line, 1);
    drawText(ctx, item.icon, x + 34, y + 38, { size: 27, weight: "900", colour: text, align: "center" });
    drawText(ctx, item.label, x + 110, y + 36, { size: 19, weight: "900", colour: text, align: "center", maxWidth: 116 });
  });

  drawPanel(ctx, 70, 800, 940, 140, "CAREER AVERAGES");
  const statItems = [
    ["PPG", data.ppg],
    ["RPG", data.rpg],
    ["APG", data.apg],
    ["DEF", `+${Math.round(Number(breakdown.avgDefense || 0))}`],
  ];
  statItems.forEach((item, index) => {
    const x = 105 + index * 225;
    roundRect(ctx, x, 858, 185, 54, 10, panel2, line, 1);
    drawText(ctx, String(item[1]), x + 92, 890, { size: 34, weight: "900", colour: text, align: "center" });
    drawText(ctx, item[0], x + 92, 912, { size: 15, weight: "900", colour: muted, align: "center" });
  });

  drawPanel(ctx, 70, 975, 940, 155, "BEST SEASON");
  drawWrappedText(ctx, data.bestSeason, 105, 1045, 850, 32, {
    size: 30,
    weight: "900",
    colour: text,
  });

  drawPanel(ctx, 70, 1165, 940, 105, "NBA CAREER ROULETTE");
  drawWrappedText(ctx, `${data.draftLine} • ${data.seasons} seasons • ${data.championships}x Champion`, 105, 1230, 850, 26, {
    size: 23,
    weight: "900",
    colour: muted,
  });

  return canvas;
}



function drawGridBackground(ctx, width, height) {
  ctx.strokeStyle = "rgba(17, 20, 24, 0.055)";
  ctx.lineWidth = 2;

  for (let x = 0; x <= width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawPanel(ctx, x, y, w, h, title) {
  roundRect(ctx, x, y, w, h, 26, "#ffffff", "#111418", 5);
  drawText(ctx, title, x + 32, y + 46, {
    size: 22,
    weight: "900",
    colour: "#5f5a51",
    letterSpacing: 3,
  });
}

function drawAverageBarCanvas(ctx, x, y, label, value, max, colour) {
  drawText(ctx, label, x, y + 24, { size: 25, weight: "900", colour: "#111418" });
  roundRect(ctx, x + 92, y, 245, 32, 14, "#fff0dc", "#111418", 4);
  const fillWidth = Math.max(0, Math.min(245, (value / max) * 245));
  roundRect(ctx, x + 92, y, fillWidth, 32, 14, colour, null, 0);
  drawText(ctx, value.toFixed(1), x + 360, y + 25, { size: 25, weight: "900", colour: "#111418" });
}

function drawAwardsCanvas(ctx, awards, x, y) {
  if (!awards.length) {
    drawPlayoffBadgeCanvas(ctx, x, y, "—", "NONE");
    return;
  }

  const display = awards.slice(0, 9);
  display.forEach((award, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const ax = x + col * 130;
    const ay = y + row * 72;
    roundRect(ctx, ax, ay, 108, 58, 14, "#ffe0ce", "#111418", 4);
    drawText(ctx, award.icon, ax + 54, ay + 26, { size: 25, weight: "900", colour: "#111418", align: "center" });
    drawText(ctx, `${award.count}x ${award.label}`, ax + 54, ay + 48, { size: 15, weight: "900", colour: "#111418", align: "center", maxWidth: 96 });
  });
}

function drawPlayoffBadgeCanvas(ctx, x, y, value, label) {
  roundRect(ctx, x, y, 110, 108, 18, "#fff9ef", "#111418", 4);
  drawText(ctx, String(value), x + 55, y + 50, { size: 38, weight: "900", colour: "#111418", align: "center" });
  drawText(ctx, label, x + 55, y + 84, { size: 17, weight: "900", colour: "#5f5a51", align: "center" });
}

function drawOffCourtCanvas(ctx, offCourt, x, y) {
  const items = offCourt.length
    ? offCourt.slice(-8).reverse().map((item) => `S${item.season}: ${item.result}`)
    : ["No off-court moments"];

  let cursorX = x;
  let cursorY = y;

  items.forEach((item) => {
    const text = String(item);
    ctx.font = `900 24px Arial, Helvetica, sans-serif`;
    const w = Math.min(ctx.measureText(text).width + 34, 420);

    if (cursorX + w > 980) {
      cursorX = x;
      cursorY += 58;
    }

    roundRect(ctx, cursorX, cursorY, w, 42, 18, "#fff9ef", "#111418", 3);
    drawText(ctx, text, cursorX + 17, cursorY + 29, {
      size: 21,
      weight: "900",
      colour: "#111418",
      maxWidth: w - 34,
    });

    cursorX += w + 14;
  });
}

function roundRect(ctx, x, y, w, h, r, fill, stroke, lineWidth = 0) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (stroke && lineWidth) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawText(ctx, text, x, y, options = {}) {
  const size = options.size || 24;
  const weight = options.weight || "700";
  const colour = options.colour || "#111418";
  const align = options.align || "left";

  ctx.save();
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";

  const value = String(text || "");
  const maxWidth = options.maxWidth;

  if (options.letterSpacing && value.length < 45) {
    drawLetterSpacedText(ctx, value, x, y, options.letterSpacing, align);
  } else if (maxWidth) {
    ctx.fillText(truncateCanvasText(ctx, value, maxWidth), x, y);
  } else {
    ctx.fillText(value, x, y);
  }

  ctx.restore();
}

function drawLetterSpacedText(ctx, text, x, y, spacing, align) {
  const chars = String(text).split("");
  const totalWidth = chars.reduce((sum, char) => sum + ctx.measureText(char).width + spacing, 0) - spacing;
  let currentX = align === "center" ? x - totalWidth / 2 : x;

  chars.forEach((char) => {
    ctx.fillText(char, currentX, y);
    currentX += ctx.measureText(char).width + spacing;
  });
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
  const size = options.size || 24;
  const weight = options.weight || "700";
  const colour = options.colour || "#111418";
  ctx.save();
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;

  const words = String(text || "").split(" ");
  let line = "";
  let currentY = y;

  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = test;
    }
  });

  if (line) ctx.fillText(line, x, currentY);
  ctx.restore();
}

function truncateCanvasText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;

  let truncated = value;
  while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}…`;
}

function fitTextSize(ctx, text, maxWidth, startSize, weight = "900") {
  let size = startSize;
  while (size > 34) {
    ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return size;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
  });
}

async function downloadShareImage() {
  const canvas = createCareerShareCanvas();
  const blob = await canvasToBlob(canvas);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(state.playerName || "career")}-career-card.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function shareCareerImage() {
  const canvas = createCareerShareCanvas();
  const blob = await canvasToBlob(canvas);
  if (!blob) return;

  const file = new File([blob], `${slugify(state.playerName || "career")}-career-card.png`, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    await navigator.share({
      title: `${state.playerName} Career Card`,
      text: "NBA Career Roulette résumé",
      files: [file],
    });
    return;
  }

  await downloadShareImage();
}

function copySummary() {
  const rows = [
    ["Player", state.playerName],
    ...getFinalRows(),
  ];

  const text = rows.map(([label, value]) => `${label}: ${value || "Pending"}`).join("\n");

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(flashCopy).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand("copy");
  } catch {}

  document.body.removeChild(textarea);
  flashCopy();
}

function flashCopy() {
  const original = elements.copyButton.textContent;
  elements.copyButton.textContent = "Copied";
  setTimeout(() => {
    elements.copyButton.textContent = original;
  }, 1100);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function getTeamAbbreviation(teamName) {
  if (!teamName) return "—";
  if (typeof teamAbbreviations !== "undefined" && teamAbbreviations[teamName]) return teamAbbreviations[teamName];

  const words = String(teamName)
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "—";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();

  return words
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function getTeamClassToken(teamName) {
  return String(teamName || "none")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "none";
}

function renderTeamPill(teamName, fallback = "—") {
  const label = teamName ? getTeamAbbreviation(teamName) : fallback;
  const token = getTeamClassToken(teamName);
  return `<span class="team-pill team-pill-${escapeHtml(token)}" data-team="${escapeHtml(teamName || "")}">${escapeHtml(label)}</span>`;
}



elements.playerNameInput?.addEventListener("input", (event) => {
  state.playerName = event.target.value.trim();
  saveState();
  render();
});

elements.skipEndButton?.addEventListener("click", skipToCareerEndForTesting);
elements.resetButton?.addEventListener("click", resetState);
elements.copyButton?.addEventListener("click", copySummary);
elements.closeModalButton?.addEventListener("click", () => closeModal());
elements.continueButton?.addEventListener("click", () => closeModal());
elements.injuryContinueButton?.addEventListener("click", closeInjuryReveal);
elements.bonusReSpinButton?.addEventListener("click", useBonusReSpin);
elements.closeFinalModalButton?.addEventListener("click", closeFinalModal);
elements.downloadImageButton?.addEventListener("click", downloadShareImage);
elements.shareImageButton?.addEventListener("click", shareCareerImage);
elements.copyFinalButton?.addEventListener("click", copySummary);
elements.restartFinalButton?.addEventListener("click", resetState);
elements.boostInfoOkButton?.addEventListener("click", closeBoostInfoModal);

elements.resultModal?.addEventListener("click", (event) => {
  if (event.target === elements.resultModal) closeModal();
});

elements.finalModal?.addEventListener("click", (event) => {
  if (event.target === elements.finalModal) closeFinalModal();
});

elements.boostInfoModal?.addEventListener("click", (event) => {
  if (event.target === elements.boostInfoModal) closeBoostInfoModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
    closeFinalModal();
  }
});

window.addEventListener("load", render);