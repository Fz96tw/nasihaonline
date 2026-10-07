// Curated Weekly Reflection pool (seeded by prisma/seed.ts, keyed on `text`).
// Selection rules: general wisdom on kindness, resilience, community,
// learning and purpose; secular framing; and only quotes with a documented
// attribution — widely circulated but misattributed lines (the "Einstein /
// Gandhi / Twain said it" kind) are deliberately left out. Proverbs are
// credited to their tradition. To retire an entry, set active=false in the
// database (admin UI) rather than deleting it here: the seed would recreate it.

export type ReflectionQuoteSeed = {
  text: string;
  author: string;
  source?: string;
  prompt: string;
};

export const REFLECTION_QUOTES: ReflectionQuoteSeed[] = [
  // Kindness & compassion
  {
    text: "No act of kindness, no matter how small, is ever wasted.",
    author: "Aesop",
    prompt: "Share a small kindness someone showed you that stayed with you.",
  },
  {
    text: "In the long run, the sharpest weapon of all is a kind and gentle spirit.",
    author: "Anne Frank",
    prompt: "When has gentleness accomplished something that force could not?",
  },
  {
    text: "Whoever is happy will make others happy too.",
    author: "Anne Frank",
    source: "The Diary of a Young Girl",
    prompt: "Think of someone whose good mood lifted a room. What did they do?",
  },
  {
    text: "How wonderful it is that nobody need wait a single moment before starting to improve the world.",
    author: "Anne Frank",
    source: "The Diary of a Young Girl",
    prompt: "What is one small thing you could do this week to make things a little better for someone?",
  },
  {
    text: "Wherever there is a human being, there is an opportunity for a kindness.",
    author: "Seneca",
    prompt: "Where did you notice an opportunity for kindness this week, and did you take it?",
  },
  {
    text: "No one is useless in this world who lightens the burden of it to any one else.",
    author: "Charles Dickens",
    source: "Our Mutual Friend",
    prompt: "Who has lightened a burden for you? How did it change your day?",
  },
  {
    text: "Be kind, for everyone you meet is fighting a hard battle.",
    author: "Ian Maclaren",
    prompt: "How do you remind yourself to extend patience to people when you don't know their story?",
  },
  {
    text: "Life's most persistent and urgent question is, 'What are you doing for others?'",
    author: "Martin Luther King Jr.",
    prompt: "What are you doing for others right now, and what would you like to do more of?",
  },

  // Resilience & perseverance
  {
    text: "It does not matter how slowly you go as long as you do not stop.",
    author: "Confucius",
    prompt: "What are you making slow but steady progress on? What keeps you going?",
  },
  {
    text: "Fall seven times, stand up eight.",
    author: "Japanese proverb",
    prompt: "Share a time you got back up after a setback. What helped?",
  },
  {
    text: "A smooth sea never made a skilled sailor.",
    author: "Proverb",
    prompt: "What difficult stretch taught you something you couldn't have learned any other way?",
  },
  {
    text: "Although the world is full of suffering, it is also full of the overcoming of it.",
    author: "Helen Keller",
    prompt: "Where have you seen someone overcome something hard? What did you take from it?",
  },
  {
    text: "Hope is the thing with feathers that perches in the soul.",
    author: "Emily Dickinson",
    prompt: "What gives you hope when things feel uncertain?",
  },
  {
    text: "I learned that courage was not the absence of fear, but the triumph over it.",
    author: "Nelson Mandela",
    source: "Long Walk to Freedom",
    prompt: "Describe a time you did something while afraid. What got you through?",
  },
  {
    text: "You gain strength, courage, and confidence by every experience in which you really stop to look fear in the face.",
    author: "Eleanor Roosevelt",
    source: "You Learn by Living",
    prompt: "What did facing something you feared teach you about yourself?",
  },
  {
    text: "The only thing we have to fear is fear itself.",
    author: "Franklin D. Roosevelt",
    source: "First Inaugural Address, 1933",
    prompt: "Has fear of something ever turned out to be worse than the thing itself?",
  },
  {
    text: "We suffer more often in imagination than in reality.",
    author: "Seneca",
    source: "Letters to Lucilius",
    prompt: "Share a time a worry turned out to be bigger in your head than in real life.",
  },
  {
    text: "Nobody can go back and start a new beginning, but anyone can start today and make a new ending.",
    author: "Maria Robinson",
    prompt: "What new ending would you like to start working toward today?",
  },
  {
    text: "Life can only be understood backwards; but it must be lived forwards.",
    author: "Søren Kierkegaard",
    prompt: "What looks different to you now than it did while you were living through it?",
  },

  // Community & working together
  {
    text: "Alone we can do so little; together we can do so much.",
    author: "Helen Keller",
    prompt: "Share something you accomplished with the help of others that you couldn't have done alone.",
  },
  {
    text: "If you want to go fast, go alone. If you want to go far, go together.",
    author: "African proverb",
    prompt: "When has working with others taken you further than you could have gone on your own?",
  },
  {
    text: "It takes a village to raise a child.",
    author: "African proverb",
    prompt: "Who has been part of your village? How would you like to be part of someone else's?",
  },
  {
    text: "Talent wins games, but teamwork and intelligence win championships.",
    author: "Michael Jordan",
    source: "I Can't Accept Not Trying",
    prompt: "What makes a team you've been part of work well?",
  },
  {
    text: "A problem shared is a problem halved.",
    author: "Proverb",
    prompt: "When did sharing a problem with someone make it feel lighter?",
  },
  {
    text: "Injustice anywhere is a threat to justice everywhere.",
    author: "Martin Luther King Jr.",
    source: "Letter from Birmingham Jail",
    prompt: "What does it mean to you to look out for people beyond your own circle?",
  },
  {
    text: "The time is always right to do what is right.",
    author: "Martin Luther King Jr.",
    prompt: "Share a time you did the right thing even though the timing wasn't convenient.",
  },
  {
    text: "What you do makes a difference, and you have to decide what kind of difference you want to make.",
    author: "Jane Goodall",
    prompt: "What kind of difference do you want to make, and where are you starting?",
  },

  // Learning & curiosity
  {
    text: "Only the educated are free.",
    author: "Epictetus",
    source: "Discourses",
    prompt: "What did you learn that changed how you see things, or gave you more choices?",
  },
  {
    text: "Education is the most powerful weapon which you can use to change the world.",
    author: "Nelson Mandela",
    prompt: "Who taught you something that changed your path? What did they do well?",
  },
  {
    text: "The important thing is not to stop questioning.",
    author: "Albert Einstein",
    source: "LIFE magazine, 1955",
    prompt: "What are you curious about right now?",
  },
  {
    text: "Imagination is more important than knowledge.",
    author: "Albert Einstein",
    source: "The Saturday Evening Post, 1929",
    prompt: "When has imagination helped you solve something that facts alone couldn't?",
  },
  {
    text: "If I have seen further, it is by standing on the shoulders of giants.",
    author: "Isaac Newton",
    prompt: "Whose shoulders have you stood on? Who would you like to thank?",
  },
  {
    text: "Learning never exhausts the mind.",
    author: "Leonardo da Vinci",
    prompt: "What is something you've started learning recently, and what is keeping you at it?",
  },
  {
    text: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.",
    author: "Dr. Seuss",
    source: "I Can Read With My Eyes Shut!",
    prompt: "What is a book, article or conversation that took you somewhere new?",
  },
  {
    text: "To know what you know and what you do not know, that is true knowledge.",
    author: "Confucius",
    prompt: "What is something you've realized you don't know yet, and how do you plan to find out?",
  },
  {
    text: "I am among those who think that science has great beauty.",
    author: "Marie Curie",
    prompt: "What is something that fills you with curiosity or wonder?",
  },

  // Purpose, action & self-knowledge
  {
    text: "The journey of a thousand miles begins with a single step.",
    author: "Lao Tzu",
    source: "Tao Te Ching",
    prompt: "What is one first step you could take this week toward something that matters to you?",
  },
  {
    text: "Knowing others is intelligence; knowing yourself is true wisdom.",
    author: "Lao Tzu",
    source: "Tao Te Ching",
    prompt: "What is something you've learned about yourself in the past year?",
  },
  {
    text: "The unexamined life is not worth living.",
    author: "Socrates",
    prompt: "How do you make time to reflect on how things are going?",
  },
  {
    text: "It is not that we have a short time to live, but that we waste a lot of it.",
    author: "Seneca",
    source: "On the Shortness of Life",
    prompt: "What is one thing you want to spend more of your time on?",
  },
  {
    text: "The curious paradox is that when I accept myself just as I am, then I can change.",
    author: "Carl Rogers",
    source: "On Becoming a Person",
    prompt: "Has accepting something about yourself ever made change easier?",
  },
  {
    text: "Not all those who wander are lost.",
    author: "J.R.R. Tolkien",
    source: "The Fellowship of the Ring",
    prompt: "Share a detour in your path that turned out to be valuable.",
  },
  {
    text: "It is our choices that show what we truly are, far more than our abilities.",
    author: "J.K. Rowling",
    source: "Harry Potter and the Chamber of Secrets",
    prompt: "What is a choice you made that you're proud of?",
  },
  {
    text: "Do what you feel in your heart to be right, for you'll be criticized anyway.",
    author: "Eleanor Roosevelt",
    prompt: "How do you decide when to follow your own judgment despite what others think?",
  },
  {
    text: "The only way to do great work is to love what you do.",
    author: "Steve Jobs",
    source: "Stanford commencement address, 2005",
    prompt: "What work or activity makes you lose track of time?",
  },
  {
    text: "Well done is better than well said.",
    author: "Benjamin Franklin",
    source: "Poor Richard's Almanack",
    prompt: "Share an example of someone whose actions spoke louder than their words.",
  },
  {
    text: "Genius is one percent inspiration, ninety-nine percent perspiration.",
    author: "Thomas Edison",
    prompt: "What has taken far more effort than you expected, and was it worth it?",
  },
  {
    text: "The best time to plant a tree was twenty years ago. The second best time is now.",
    author: "Proverb",
    prompt: "What is something you wish you'd started sooner, and what would starting it today look like?",
  },
];
