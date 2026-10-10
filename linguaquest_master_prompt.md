# LinguaQuest: Open-World Chinese Survival RPG — Master Prompt

You are an expert Full-Stack Engineer, AI Architect, and Game UI Designer specializing in React, Framer Motion, Google Gemini API, ElevenLabs TTS pipelines, and TigerData (PostgreSQL time-series analytics).

Your task is to build a complete, production-ready, single-file React prototype for **"LinguaQuest: Open-World Chinese Survival RPG"** — a gamified Mandarin language learning application powered by Gemini 1.5/2.0 for dialogue & adaptivity, ElevenLabs for voice output, and TigerData for real-time user performance analytics.

---

## 1. ARCHITECTURE & TECH STACK INTEGRATION

1. **Google Gemini API (`@google/genai` or REST API):**
   - Serves as the core game master and NPC brain.
   - Processes user voice/text transcripts in Mandarin, evaluates grammar and tone, computes `patience_delta` and `xp_awarded`, and returns dynamic $i+1$ vocabulary challenges in structured JSON mode.
2. **ElevenLabs Text-to-Speech API:**
   - Synthesizes realistic, expressive Mandarin audio (`zh-CN` voice IDs) on the fly for NPC responses.
   - Streams audio back to the UI to give the Visual Novel character an authentic voice during stage demos. Includes fallback audio triggers if an API key is omitted.
3. **TigerData (PostgreSQL / Time-Series Analytics):**
   - Acts as the telemetry and event logging engine.
   - Logs real-time time-series metrics per turn: `hesitation_ms`, `tone_accuracy_score`, `patience_level`, `xp_delta`, and `api_latency`.
   - Powers an end-of-round "Performance & Fluency Dashboard" displaying time-bucketed performance graphs using SQL time-series analytics.
4. **Frontend & UI Polish:**
   - Framework: React (Functional Components with Hooks).
   - Styling: Tailwind CSS (Arcade / Cyberpunk RPG aesthetics).
   - Animations: Framer Motion (floating RPG XP text, dynamic screen shakes, particle pops, HUD gauge animations).
   - Audio UI: Web Speech API (`zh-CN` STT speech recognition & TTS voice synthesis fallback).

---

## 2. BACKEND GEMINI SYSTEM PROMPT & STRUCTURED JSON SCHEMA

Configure the Gemini client call to enforce structured JSON output matching this schema on every turn:

```json
{
  "npc_dialogue_hanzi": "太贵了？我这可是正宗龙井茶！最多给你打九折。",
  "npc_dialogue_pinyin": "Tài guì le? Wǒ zhè kěshì zhèngzōng Lóngjǐng chá! Zuìduō gěi nǐ dǎ jiǔ zhé.",
  "npc_dialogue_english": "Too expensive? This is authentic Longjing tea! At most I can give you 10% off.",
  "npc_emotion": "annoyed", 
  "patience_delta": -5,
  "target_word_used": true,
  "xp_awarded": 150,
  "next_target_words": [
    {"hanzi": "便宜", "pinyin": "piányi", "english": "cheap", "xp": 100},
    {"hanzi": "再少一点", "pinyin": "zài shǎo yīdiǎn", "english": "a bit less", "xp": 200}
  ],
  "tone_grammar_critique": "Great use of '九折', but watch your tone on '太' (4th tone)."
}
```

---

## 3. REQUIRED SCENARIOS DATASET (MANDARIN CHINESE)

Include 4 fully interactive location nodes with dedicated ElevenLabs Voice Profiles and scenario parameters:

### 🏮 Scenario 1: Shanghai Night Market (Haggling - Intermediate)
* **Location ID:** `shanghai_market`
* **NPC Character:** 张老板 (Manager Zhang - Impertinent Stall Vendor)
* **ElevenLabs Voice Profile:** Expressive Male (`zh-CN-market-vendor`)
* **Initial Situation:** The player wants to buy a tea set priced at 200 RMB.
* **Victory Condition:** Haggling the price down below 150 RMB using polite target vocabulary.
* **Target Vocabulary Set:**
  1. `便宜一点` (*piányi yīdiǎn*) - A bit cheaper (+100 XP)
  2. `太贵了` (*tài guì le*) - Too expensive (+100 XP)
  3. `折扣` (*zhékòu*) - Discount (+150 XP)
  4. `最低价` (*zuìdī jià*) - Lowest price (+200 XP)

### 🚖 Scenario 2: Beijing Taxi Ride (Navigation - Beginner)
* **Location ID:** `beijing_taxi`
* **NPC Character:** 师傅 (Master Driver - Impatient Beijing Cabbie)
* **ElevenLabs Voice Profile:** Deep Male (`zh-CN-taxi-driver`)
* **Initial Situation:** Traffic is heavy; driver needs clear street directions to the hotel.
* **Victory Condition:** Reaching the destination before driver's patience runs out.
* **Target Vocabulary Set:**
  1. `左转` (*zuǒzhuǎn*) - Turn left (+100 XP)
  2. `右转` (*yòuzhuǎn*) - Turn right (+100 XP)
  3. `直走` (*zhízǒu*) - Go straight (+100 XP)
  4. `靠边停` (*kàobiān tíng*) - Pull over here (+150 XP)

### 🥢 Scenario 3: Guangzhou Dim Sum Cafe (Dining - Intermediate)
* **Location ID:** `guangzhou_dimsum`
* **NPC Character:** 服务员 (Waitress - Busy Dim Sum Staff)
* **ElevenLabs Voice Profile:** Friendly Female (`zh-CN-waitress`)
* **Initial Situation:** Ordering food during lunch rush with dietary requests.
* **Victory Condition:** Successfully ordering dishes, requesting less sugar, and paying the bill.
* **Target Vocabulary Set:**
  1. `这个` (*zhège*) - This one (+50 XP)
  2. `减糖` (*jiǎn táng*) - Less sugar (+150 XP)
  3. `买单` (*mǎidān*) - Check please (+100 XP)
  4. `招牌菜` (*zhāopái cài*) - Signature dish (+200 XP)

### 🛫 Scenario 4: Beijing Capital Airport Customs (Customs - Advanced)
* **Location ID:** `beijing_customs`
* **NPC Character:** 海关官员 (Customs Officer - Strict Border Agent)
* **ElevenLabs Voice Profile:** Formal/Strict Male (`zh-CN-officer`)
* **Initial Situation:** Declaring travel purpose, baggage contents, and duration of stay.
* **Victory Condition:** Passing inspection without triggers or delays.
* **Target Vocabulary Set:**
  1. `护照` (*hùzhào*) - Passport (+100 XP)
  2. `旅游` (*lǚyóu*) - Tourism (+100 XP)
  3. `停留` (*tíngliú*) - Duration of stay (+150 XP)
  4. `申报` (*shēnbào*) - Declare items (+200 XP)

*Crucial Demo Rule:* Non-Chinese speaking judges will be watching the projector screen. All active target words, dialogue bubbles, and floating RPG popups MUST display **Hanzi**, **Pinyin with tone marks**, and **English translations** simultaneously!

---

## 4. REQUIRED UI COMPONENTS & GAMEPLAY FLOW

### 1. Arcade HUD & Status Bar (Top Anchor)
- **Character Stats:** Player Level, XP progress bar, HSK rank badge (HSK 1 $\rightarrow$ HSK 4).
- **Dynamic Vibe / Patience Meter:** Color-changing glowing bar (Green/Yellow/Red) updated via Gemini `patience_delta`.
- **Multiplier Combo Streak:** Displays $2\times, 3\times$ flame badge when target vocabulary is used back-to-back.
- **Active Services Indicator:** Glowing status pills showing live connections (`[Gemini API: OK]`, `[ElevenLabs: Active]`, `[TigerData: Logging]`).

### 2. Node-Based Overworld Map
- Interactive arcade map UI with node cards displaying location title, difficulty rating, recommended vocabulary list, and an "ENTER LOCATION" button.

### 3. First-Person Visual Novel Scenario Screen
- Animated 2D/3D NPC avatar responding to `npc_emotion` (`neutral`, `impressed`, `confused`, `annoyed`).
- Speech bubble displaying streamed dialogue, Pinyin toggle, audio replay button triggering ElevenLabs TTS, and real-time grammar critique tooltip.

### 4. Floating RPG Text Engine (Key Demo Feature)
- Floating Target Word Badges orbiting near the NPC:
  - Example: `[ 便宜 piányi ] (+100 XP)` gently floating in 3D space.
  - When Gemini verifies target word usage, trigger a Framer Motion burst: text pops, scales up, glows neon green, floats upward, and dissolves with particle effects.
- On hesitate/error: Trigger a red floating `-15 Patience` wobble animation.

### 5. Adaptive "Speech Belt" & Real-Time Input Center
- Active inventory belt showing target word cards with Hanzi, Pinyin, and English hints.
- Real-Time Voice Input button ("Hold to Speak Chinese") linked to Web Speech API STT.
- Quick Test Triggers for instant demo interaction without needing live speech.
- Emergency "Panic Lifeline" button: Spends 50 XP to trigger an LLM-suggested hint phrase.

### 6. TigerData End-of-Round Analytics Dashboard ("Loot Drop")
- Displays upon quest completion or patience depletion.
- **TigerData Time-Series Analytics View:** Renders interactive performance charts showing:
  - *Player Fluency & Hesitation Trend* over session duration.
  - *NPC Patience Curve* vs Time.
  - *Vocabulary Mastery Table* query results from TigerData hypertables.
- Summary stats: Total XP gained, acquired Hanzi word cards, and a button returning to the Overworld Map.

---

## 5. DELIVERABLE CODE STRUCTURE

Provide the COMPLETE, WORKING source code in a single copy-pasteable React file.
- Implement API service handlers for Gemini API, ElevenLabs TTS REST calls, and TigerData event logging (with client-side fallback simulators for instant keyless testing).
- Include Tailwind CSS mappings, Framer Motion animation triggers, and Lucide-React icons.
- Ensure every button updates state, triggers Gemini/ElevenLabs/TigerData handlers, and produces crisp visual feedback loops.