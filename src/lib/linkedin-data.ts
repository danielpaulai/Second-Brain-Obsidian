/**
 * linkedin-data.ts — the last 10 LinkedIn posts (scraped via Apify), trimmed to what the
 * demo needs. Used BOTH by the stage "scrape" theater (post cards slideshow) and by the
 * suggestLinkedInPost sub-agent tool (captions + reactions → a new post idea).
 * Source of truth: output.json at the repo root.
 */

export type LinkedInReaction = { type: string; count: number };
export type LinkedInPost = {
  id: string;
  author: { name: string; headline: string; avatar: string };
  content: string;
  postedAgo: string;
  image: string | null;
  likes: number;
  comments: number;
  shares: number;
  reactions: LinkedInReaction[];
};

export const LINKEDIN_POSTS: LinkedInPost[] = [
  {
    "id": "7467470213983166466",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "I built a LinkedIn sales funnel using Claude in 2 hours.\n\nAnd it takes less work to maintain than your current manual process.\n\nHere is the exact 7-step system for you to build your own funnel:\n\nStep 1: Build your ICP and positioning.\nLoad your ICP, positioning, and banned words into a Claude Project before you write a single word.\n\nStep 2: Map your content calendar.\nAssign every post one intent before touching anything else.\n\nStep 3: Build your content skills.\nThree skills. /post writes full posts. /hook generates 10 variations. \n/repurpose turns one post into a carousel, cheat sheet, and video script.\n\nStep 4: Connect Apify and build your lead list.\nPull every person who engaged with your posts and drop them into Airtable automatically.\n\nStep 5: Build your DM skills.\nTwo skills. /connect sends personalised requests. /dm follows up referencing their exact pain point.\n\nStep 6: Build your follow-up pipeline.\nOne skill. /follow-up moves every conversation toward a booked call based on their last response.\n\nStep 7: Automate the whole system.\n\nSet it once and run it every week.\nSo you can focus on the things that actually drive revenue for your business.\n\nIf you are a solo founder or small business owner and want AI to do the heavy lifting for your business, join the waitlist for my next AI workshop: \nhttps://lnkd.in/dDRWMCUu\n\nP.S.Which step are you building first?",
    "postedAgo": "12h",
    "image": "https://media.licdn.com/dms/image/v2/D4D22AQGo4UUw8PzfFw/feedshare-shrink_1280/B4DZ6G7.G1JUAQ-/0/1780380328619?e=1781740800&v=beta&t=B1IsSPl4OaqPMJIsrasNy2bTxj2KlS8skgK0C27yW84",
    "likes": 40,
    "comments": 15,
    "shares": 1,
    "reactions": [
      {
        "type": "LIKE",
        "count": 32
      },
      {
        "type": "EMPATHY",
        "count": 4
      },
      {
        "type": "APPRECIATION",
        "count": 2
      },
      {
        "type": "INTEREST",
        "count": 2
      }
    ]
  },
  {
    "id": "7463906644842786816",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "AI tools are recommending experts in your niche right now.\n\nAnd your name is probably not on that list.\n\nI found this out the hard way.\nI went to ChatGPT and searched for the top AI trainer on LinkedIn.\n\nMy name didn't come up.\nSo I went to Google's Gemini and asked, \n\n\" Who is the best trainer at NAS Academy's AI School?”\n\nI had to type my own name just to get an answer about myself.\n\nThat's when I realised, if your AI visibility score is under 50, AI tools will never recommend you.\n\nHere's the 5-minute trick to fix it:\n\nGo to ChatGPT. Feed it the truth about you.\nYou just ingested the answer. Then asked AI to verify it.\n\nDo this a few times across ChatGPT and Gemini.\n\nThen search your name again a few days later.\nYour name starts appearing in the recommended list.\n\nAI learns from what it finds. Give it something to find.\nThis is one of the things I taught in my last workshop.\n\nMy next workshop goes even deeper.\n\nI am hosting a 2-day live workshop on June 12 and 13 on automating your sales and marketing using Claude. \n\nJoin the waitlist: https://lnkd.in/dDRWMCUu\n\nP.S. Have you ever searched your own name on ChatGPT or Gemini?",
    "postedAgo": "1w",
    "image": null,
    "likes": 51,
    "comments": 9,
    "shares": 0,
    "reactions": [
      {
        "type": "LIKE",
        "count": 40
      },
      {
        "type": "EMPATHY",
        "count": 6
      },
      {
        "type": "INTEREST",
        "count": 3
      },
      {
        "type": "PRAISE",
        "count": 1
      },
      {
        "type": "APPRECIATION",
        "count": 1
      }
    ]
  },
  {
    "id": "7465295772314578947",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "I built an AI workflow that automates your entire sales and marketing.\nAnd I am giving it away free for the next 72 hours.\n\nIf you are a solo founder or small business owner, this is for you.\n\nRight now, you are writing cold outreach manually, guessing what content to post, losing track of prospects, and showing up to sales calls unprepared.\n\nThis system fixes all of it.\n\nHere is what you are getting:\n\n10 Claude Skills and One Connected System. \n\n1/ Buyer Brief.\n2/ Prospect Finder.\n3/ Content Engine.\n4/ Post Writer.\n5/ Cold Opener.\n6/ Follow Up Machine.\n7/ Sales Call Prep.\n8/ Proposal Writer.\n9/ Email Converter.\n10/ Client Keeper.\n\nSimply do this:\n\nLike this post 👍\nComment \"Automate\"\nConnect with me (you MUST connect - very important)\n\n♻️ Repost this and I will send you exclusive access to my live 2-hour workshop:\nHow to Build Your AI CEO Using Claude. The exact system I use to run my entire business on autopilot.",
    "postedAgo": "6d",
    "image": "https://media.licdn.com/dms/image/v2/D4E22AQFAmTC9RX3JAA/feedshare-shrink_1280/B4EZ5oG.8LG0AQ-/0/1779863122463?e=1781740800&v=beta&t=E5xXCf-ppf07-WnFnCytqiCxqnfX3MOzWIu93pNGX0I",
    "likes": 268,
    "comments": 708,
    "shares": 27,
    "reactions": [
      {
        "type": "LIKE",
        "count": 243
      },
      {
        "type": "EMPATHY",
        "count": 17
      },
      {
        "type": "INTEREST",
        "count": 5
      },
      {
        "type": "ENTERTAINMENT",
        "count": 1
      },
      {
        "type": "PRAISE",
        "count": 1
      },
      {
        "type": "APPRECIATION",
        "count": 1
      }
    ]
  },
  {
    "id": "7466020712336723968",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "Your next 30 LinkedIn posts are already written.\n\nThey are sitting in your tools. \n\nClaude just needs to read them.\n\nHere are 7 Claude connectors that turn your existing tools into a LinkedIn lead machine.\n\n01/ Notion: \nIt pulls post ideas and frameworks from your existing notes instantly.\n\n02/ Gmail: \nIt finds client emails and turns their pain points into LinkedIn post angles.\n\n03/ Google Drive: \nIt extracts proof points and frameworks from your case studies and proposals.\n\n04/ Google Calendar: \nIt maps a weekly content plan around your actual meetings and events.\n\n05/ Granola: \nIt pulls exact problems from your meeting transcripts and turns them into posts.\n\n06/ Canva: \nIt takes your carousel copy and builds it in Canva using your brand colours. Done in minutes.\n\n07/ Apify: \nIt scrapes every person who engaged with your posts and loads them into your pipeline automatically.\n\nSet these once, and Claude pulls from every tool you already use.\nYour LinkedIn content stops being manual work.\n\nI am hosting a 2-day live workshop on June 12 and 13 on automating your sales and marketing using Claude. \n\nJoin the waitlist: https://lnkd.in/dDRWMCUu\n\nP.S. Which connector are you setting up first?",
    "postedAgo": "4d",
    "image": "https://media.licdn.com/dms/image/v2/D4D22AQFVCH6FurDdXA/feedshare-image-high-res/B4DZ5yZIQ_JQAU-/0/1780035650912?e=1781740800&v=beta&t=mKVYTiFLeeSt6WcNYmr9VbejRND24rl8rCa7hUlpJ2c",
    "likes": 89,
    "comments": 19,
    "shares": 7,
    "reactions": [
      {
        "type": "LIKE",
        "count": 78
      },
      {
        "type": "EMPATHY",
        "count": 5
      },
      {
        "type": "INTEREST",
        "count": 3
      },
      {
        "type": "PRAISE",
        "count": 2
      },
      {
        "type": "APPRECIATION",
        "count": 1
      }
    ]
  },
  {
    "id": "7464571300502745088",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "F#%K it. I'm gonna talk about it.\nThis isn't a happy post. But it's real.\n\nWhen you start a business, you think the people close to you will support you.\n\nYou think your family will cheer for you.\nYou think your friends will be proud of you.\n\nBut many times, they don't say anything.\n\nThey watch what you do and see your posts.\nThey don't send a single message.\nThey stay quiet.\n\nAnd then something strange happens.\nPeople you don't even know say:\n\"You're doing great. Keep going.\"\n\nA simple message from a stranger feels warmer than silence from someone you love.\n\nRunning a business is already hard.\n\nYou get tired and scared.\nYou wonder if you made the right choice.\n\nYou work when everyone else is sleeping.\nYou give everything for something you believe in.\n\nSo when the people you love stay quiet, it hurts.\nYou don't want praise.\n\nYou just hoped they cared enough to notice how hard you're trying.\n\nBut strangers see your effort today.\nThey see your courage.\nThey see your consistency.\n\nAnd they appreciate it.\nTo the people who support us, thank you.\nYour support keeps us going on the tough days.\n\nTo the quiet ones, thank you too.\nYour silence shows us who is really with us.\n\nIf you're building something, choose your circle wisely.\nStay close to people who want you to grow.\n\nP.S. Has a stranger ever supported you more than someone close to you?",
    "postedAgo": "1w",
    "image": "https://media.licdn.com/dms/image/v2/D4D22AQFJ96_8Ygl3_A/feedshare-shrink_1280/B4DZ5d4aGfJoAQ-/0/1779691528963?e=1781740800&v=beta&t=Y9U6LCmj50pMI86mcoJlLrk40ewCwI1LcJ8TYclLP-Q",
    "likes": 147,
    "comments": 93,
    "shares": 2,
    "reactions": [
      {
        "type": "LIKE",
        "count": 101
      },
      {
        "type": "EMPATHY",
        "count": 24
      },
      {
        "type": "APPRECIATION",
        "count": 17
      },
      {
        "type": "INTEREST",
        "count": 3
      },
      {
        "type": "PRAISE",
        "count": 2
      }
    ]
  },
  {
    "id": "7467107764285243392",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "I wasn't qualified for my first job.\n\nI wasn't qualified when I started teaching online.\n\nI wasn't qualified when I won the Best AI Trainer Award.\n\nEven I wasn't qualified:\n\nWhen I started my own company.\nWhen I went on Finland's Got Talent.\n\nI did all of it anyway.\n\nAnd then things started happening.\n\n- I spoke on stages across 10 countries.\n- Built brands for 100+ clients across the globe.\n- Became a 6-time Top Rated Trainer at NAS AI School.\n- Shared the stage with Robert Kiyosaki at NAC Singapore.\n- Worked with teams from Intel, NAS Academy, and Success Resources.\n\nAll of it came from refusing to use \"not ready\" as a reason to stop.\n\nThere's a certain type of person who never feels ready.\nBut they show up and figure it out anyway.\n\nThat person is the most dangerous in any room.\n\nI grew up with nothing that the world calls an advantage.\nSo I built a different skill instead.\n\nThe ability to figure things out when nobody is showing you how.\n\nIf you are sitting there thinking nobody is helping you, nobody is teaching you, nobody is showing you the way.\n\nThat is the starting point.\n\nIn 2026, the most dangerous person is the one who figures things out and uses AI to move 10x faster.\n\nThat advantage is sitting right in front of you.\nUse it the right way, and the world is yours.\n\nP.S. What would you do right now if you stopped waiting to be qualified?",
    "postedAgo": "1d",
    "image": "https://media.licdn.com/dms/image/v2/D4D22AQGE1vxbmv7fYA/feedshare-shrink_1280/B4DZ6B4kzRJUAM-/0/1780295552574?e=1781740800&v=beta&t=ZY3J-wKgL_QD2P-RJFlcTJMYemzhynKnfL5SYvRZueA",
    "likes": 103,
    "comments": 38,
    "shares": 3,
    "reactions": [
      {
        "type": "LIKE",
        "count": 72
      },
      {
        "type": "EMPATHY",
        "count": 20
      },
      {
        "type": "APPRECIATION",
        "count": 7
      },
      {
        "type": "PRAISE",
        "count": 3
      },
      {
        "type": "INTEREST",
        "count": 1
      }
    ]
  },
  {
    "id": "7464938699798032384",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "Claude just became the best LinkedIn teammate you never hired.\n\nHere are 7 ways you can use Claude to build your personal brand on LinkedIn.\n\n01/ Chat: Daily Content Brainstorm.\nGive Claude your content pillar and one thing that happened this week. \n\n02/ Projects: One Per Client.\nDrop your Voice DNA, ICP, and 5 best posts inside. \nClaude remembers your context every time you open it.\n\n03/ Cowork: Weekly Content Engine.\nWrite posts, repurpose content, and plan 30 days from one place.\n\n04/ Artifacts: Tools You Actually Use.\nBuild a content planner, lead tracker, and hook swipe file. \n\n05/ Design: Carousels in One Prompt.\nBuild your LinkedIn Designs with it.\n\n06/ Connectors: Pull Live Data Into Content.\nConnect Gmail, Notion, and Granola. \n\nClaude pulls real client conversations and turns them into post angles.\n\n07/ Skills: LinkedIn in 15 Minutes a Day.\nBuild skills for every recurring task. Type one command, and Claude runs the full workflow in your voice.\n\nThis is how founders build authority without burning out.\n\nAll right, so I have been using all 7 of these every single week.\nThe difference in output is not even close.\n\nP.S. Which of these 7 are you adding to your workflow first?",
    "postedAgo": "1w",
    "image": "https://media.licdn.com/dms/image/v2/D4D22AQFTUdGzHZCflg/feedshare-shrink_1280/B4DZ5jKL.ZKAAQ-/0/1779780075688?e=1781740800&v=beta&t=zKTmzeqrvST95B-q_s2Ru9UnUyHsWUieZ_dhLbOqtPA",
    "likes": 331,
    "comments": 67,
    "shares": 34,
    "reactions": [
      {
        "type": "LIKE",
        "count": 298
      },
      {
        "type": "EMPATHY",
        "count": 14
      },
      {
        "type": "INTEREST",
        "count": 14
      },
      {
        "type": "PRAISE",
        "count": 3
      },
      {
        "type": "APPRECIATION",
        "count": 2
      }
    ]
  },
  {
    "id": "7465659239139606528",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "This is what happened inside our last AI workshop.\nAnd nobody expected to leave feeling like this.\n\nTeaching has always been one of my favourite things to do.\nBut something happened differently in this session.\n\nWhen I saw my students getting more curious, more obsessed, asking deeper questions, it pushed me to give more than I planned.\n\nThat energy in the room was different.\nOne attendee joined at 3 AM from Colorado.\n\nI asked him, Jeff, \" Why are you still awake?\n\nHe said, \"I have always wanted to get into Claude, but never pulled the trigger. This was it.\"\n3 AM.\n\nAnd at the end of day one, another attendee said:\n\"These things Danny did, this is actually years of work packed into one session.\"\n\nThat's the room we built.\n\nThat's what happens when the right people show up ready to implement.\n\nJoin us live on Zoom for 2 days on June 12 and 13.\n\nWe are automating your sales and marketing using Claude together.\n\nYou walk away with a running system.\n\nGrab your spot here: https://lnkd.in/dDRWMCUu\n\nP.S. What is the one thing you would want to automate in your business first?",
    "postedAgo": "5d",
    "image": null,
    "likes": 39,
    "comments": 4,
    "shares": 1,
    "reactions": [
      {
        "type": "LIKE",
        "count": 25
      },
      {
        "type": "EMPATHY",
        "count": 10
      },
      {
        "type": "PRAISE",
        "count": 3
      },
      {
        "type": "APPRECIATION",
        "count": 1
      }
    ]
  },
  {
    "id": "7466146759950606336",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "This is how I run my entire LinkedIn without hiring anyone.\nAnd Claude does the heavy lifting.\n\nAnd here are 5 levels of how you can use it too.\n\nLevel 1- Claude Chat: \n\nWrite scripts and posts in your voice.\n\nLevel 2- Claude Projects: Build a memory for your brand.\nEvery conversation inside that project uses your brand automatically.\n\nLevel 3: Claude Skills: Build your own team.\n\nBuild your AI employees for every recurring task.\n\nLevel 4: Claude Code and Design: Build your graphics.\n\nAsk Claude Code to build a LinkedIn carousel.\nGive it your topic, number of slides, brand colours, and fonts.\n\nLevel 5: Claude Cowork: Automate your research.\nType /schedule inside Claude Cowork.\n\nAsk it to research LinkedIn for hot topics, find 10 post ideas, and analyze your handle against competitors.\n\nYour content plan builds itself every week.\nThis is my whole LinkedIn content system.\n\nI am hosting a 2-day live workshop on June 12 and 13, where we build this entire system together live on Zoom. \n\nJoin the waitlist here: \nhttps://lnkd.in/dDRWMCUu\n\nP.S. Which of the 5 levels are you adding to your workflow first?",
    "postedAgo": "3d",
    "image": null,
    "likes": 63,
    "comments": 20,
    "shares": 2,
    "reactions": [
      {
        "type": "LIKE",
        "count": 51
      },
      {
        "type": "EMPATHY",
        "count": 6
      },
      {
        "type": "PRAISE",
        "count": 2
      },
      {
        "type": "APPRECIATION",
        "count": 2
      },
      {
        "type": "INTEREST",
        "count": 2
      }
    ]
  },
  {
    "id": "7466148438980820992",
    "author": {
      "name": "Daniel Paul",
      "headline": "AI Trainer & Speaker | I help founders scale their businesses with AI | 6x Top-Rated AI Trainer | Founder of Purely Personal | Join our AI Founder Circle community (founders in 20+ countries) 👇",
      "avatar": "https://media.licdn.com/dms/image/v2/D4D03AQEqOKKrFcbFyA/profile-displayphoto-crop_800_800/B4DZ4GhPN0IIAQ-/0/1778225845193?e=1781740800&v=beta&t=3WLpUHV2sgdIce6X6_5YHQ8cCy1QogzH0t3sMICnmjs"
    },
    "content": "I changed 6 things about how I prompt AI for content.\n\nAnd everything changed after that.\n\nHere is exactly what I did:\n\n1/ Give it more context.\nThe more specific your ICP, offer, and situation, the better the output.\n\n2/ Give AI your voice.\nPaste 3 to 5 of your best posts and tell it to analyze your writing style before anything else.\n\n3/ Add proof to your content.\nPrompt AI to back every claim with real numbers, real clients, and real results.\n\n4/ Control the format.\nTell Claude exactly how you want the post formatted before it writes a single word.\n\n5/ Make it human.\nRun one final prompt asking Claude to remove every robotic pattern and AI tell.\n\n6/ Turn your prompts into Skills.\nBuild a Claude Skill with your full prompt chain.\n\nThese 6 changes took my content from average to converting.\n\nI am hosting a 2-day live workshop on June 13 and 14, where we build your entire sales and marketing system using Claude. \n\nJoin the waitlist: https://lnkd.in/dDRWMCUu\n\nP.S. Which of these 6 are you adding to your workflow first?",
    "postedAgo": "2d",
    "image": null,
    "likes": 33,
    "comments": 9,
    "shares": 1,
    "reactions": [
      {
        "type": "LIKE",
        "count": 23
      },
      {
        "type": "EMPATHY",
        "count": 5
      },
      {
        "type": "INTEREST",
        "count": 3
      },
      {
        "type": "APPRECIATION",
        "count": 2
      }
    ]
  }
];
