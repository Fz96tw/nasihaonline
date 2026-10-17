// Curated Weekly Reflection pool (seeded by prisma/seed.ts, keyed on `text`).
// Theme: learning and growth, drawn from traditions around the world rather
// than mostly Western ones. Selection rules: secular framing; gender-neutral
// wording (older translations that say "man"/"he" are rendered neutrally);
// and only quotes with a documented attribution — widely circulated but
// misattributed lines (the "Einstein / Gandhi / Twain said it" kind) are
// deliberately left out. Proverbs are credited to their tradition. To retire
// an entry, set active=false in the database (admin UI) rather than deleting
// it here: the seed would recreate it. (The earlier general-wisdom pool was
// retired wholesale by the 20261016120000_retire_reflection_quotes migration.)

export type ReflectionQuoteSeed = {
  text: string;
  author: string;
  source?: string;
  prompt: string;
};

export const REFLECTION_QUOTES: ReflectionQuoteSeed[] = [
  // Curiosity & asking questions
  {
    text: "Your life has a limit, but knowledge has none.",
    author: "Zhuangzi",
    source: "Zhuangzi",
    prompt: "What would you study if time were no limit?",
  },
  {
    text: "To ask is a moment's shame; not to ask is a lifetime's shame.",
    author: "Japanese proverb",
    prompt: "When did asking a \"silly\" question pay off for you?",
  },
  {
    text: "Wonder is the feeling of a philosopher, and philosophy begins in wonder.",
    author: "Socrates",
    source: "Plato, Theaetetus",
    prompt: "What has made you curious lately?",
  },
  {
    text: "I think it's much more interesting to live not knowing than to have answers which might be wrong.",
    author: "Richard Feynman",
    source: "BBC Horizon, 1981",
    prompt: "What question are you happy to leave open for now?",
  },

  // Learning from others
  {
    text: "When three people walk together, one of them can surely be my teacher.",
    author: "Confucius",
    source: "Analects",
    prompt: "What did you learn this week from someone you didn't expect to learn from?",
  },
  {
    text: "Teachers open the door, but you must enter by yourself.",
    author: "Chinese proverb",
    prompt: "Who opened a door for you, and what did you do once you walked through?",
  },
  {
    text: "Wisdom is like a baobab tree; no one person can embrace it alone.",
    author: "West African proverb",
    prompt: "What have you understood better because others shared their view?",
  },
  {
    text: "No one teaches another, nor is anyone self-taught. People teach each other, mediated by the world.",
    author: "Paulo Freire",
    source: "Pedagogy of the Oppressed",
    prompt: "What have you learned together with others that you couldn't have learned alone?",
  },
  {
    text: "While we teach, we learn.",
    author: "Seneca",
    source: "Letters to Lucilius",
    prompt: "What did you learn by explaining something to someone else?",
  },
  {
    text: "One child, one teacher, one book, one pen can change the world.",
    author: "Malala Yousafzai",
    source: "UN address, 2013",
    prompt: "Who was the teacher or mentor who changed your path?",
  },

  // Learning by doing & from mistakes
  {
    text: "Even monkeys fall from trees.",
    author: "Japanese proverb",
    prompt: "Share a mistake you made in something you're good at, and what it taught you.",
  },
  {
    text: "For the things we have to learn before we can do them, we learn by doing them.",
    author: "Aristotle",
    source: "Nicomachean Ethics",
    prompt: "What skill did you only learn by jumping in and doing it?",
  },
  {
    text: "One who gains knowledge and does not practise it is like one who ploughs a field and leaves it unsown.",
    author: "Saadi",
    source: "Gulistan",
    prompt: "What is something you know you should put into practice but haven't yet?",
  },
  {
    text: "Wherever you turn back from a loss, it is a gain.",
    author: "Turkish proverb",
    prompt: "When did changing course, even late, turn out to be the right call?",
  },
  {
    text: "It is not wrong to go back for that which you have forgotten.",
    author: "Akan proverb (Sankofa)",
    prompt: "What is something from your past you'd like to go back and learn again?",
  },

  // Humility & an open mind
  {
    text: "Knowledge gives humility.",
    author: "Hitopadesha",
    prompt: "How has learning more about something made you humbler about it?",
  },
  {
    text: "It is impossible to begin to learn what one thinks one already knows.",
    author: "Epictetus",
    source: "Discourses",
    prompt: "What did you have to unlearn before you could learn it properly?",
  },
  {
    text: "In the beginner's mind there are many possibilities, but in the expert's there are few.",
    author: "Shunryu Suzuki",
    source: "Zen Mind, Beginner's Mind",
    prompt: "What would you see differently if you came to it as a beginner again?",
  },

  // Lifelong learning & growth
  {
    text: "Learning should never cease.",
    author: "Xunzi",
    source: "Encouraging Learning",
    prompt: "What are you learning right now, formally or informally?",
  },
  {
    text: "In sandy soil, when deep you delve, you reach the springs below; the more you learn, the freer streams of wisdom flow.",
    author: "Thiruvalluvar",
    source: "Tirukkural",
    prompt: "What subject have you gone deep on, and what did you find there?",
  },
  {
    text: "The highest education is that which does not merely give us information but makes our life in harmony with all existence.",
    author: "Rabindranath Tagore",
    source: "Personality",
    prompt: "What have you learned that changed how you live, not just what you know?",
  },
  {
    text: "Seek after learning for the sake of your wellbeing.",
    author: "Māori whakataukī",
    prompt: "How does learning something new affect how you feel?",
  },
  {
    text: "Whoever is not taught by their mother will be taught by the world.",
    author: "Swahili proverb",
    prompt: "What is a lesson life taught you the hard way?",
  },
  {
    text: "Educate, agitate, organise.",
    author: "B. R. Ambedkar",
    prompt: "How has learning helped you stand up for yourself or for others?",
  },
  {
    text: "Education is the great engine of personal development.",
    author: "Nelson Mandela",
    source: "Long Walk to Freedom",
    prompt: "How has education, of any kind, changed the course of your life?",
  },
  {
    text: "Do the best you can until you know better. Then when you know better, do better.",
    author: "Maya Angelou",
    prompt: "What do you now do differently because you learned better?",
  },
];
