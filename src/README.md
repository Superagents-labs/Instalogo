# Telegram Logo Generator Bot

A TypeScript-based Telegram bot that generates business logos and branding assets using OpenAI's image generation API.

## Features

- Interactive conversation flow to gather business details
- Generate logo options based on business name, industry, and style
- Select from multiple logo options or regenerate new ones
- Get high-resolution versions of selected logos
- Option to generate a brand style guide
- Rate limiting to prevent abuse
- Persistent storage of assets in AWS S3

## Project Structure

```
src/
├── index.ts                    # Main entry point
├── types/                      # TypeScript type definitions
│   └── index.ts
├── scenes/                     # Conversation flow scenes
│   ├── index.ts                # Scene registration
│   ├── name.scene.ts           # Business name collection
│   ├── industry.scene.ts       # Industry collection
│   └── style.scene.ts          # Style preferences and generation
├── services/                   # Core services
│   ├── openai.service.ts       # OpenAI integration
│   ├── redis.service.ts        # Session and rate limiting
│   └── storage.service.ts      # AWS S3 storage
└── handlers/                   # Event handlers
    └── callback.handler.ts     # Callback query handling
```

## Setup Instructions

1. **Environment Variables**
   
   Create a `.env` file with the following:
   ```
   BOT_TOKEN=your_telegram_bot_token
   OPENAI_API_KEY=your_openai_api_key
   REDIS_URL=redis://localhost:6379
   S3_BUCKET_NAME=your_s3_bucket_name
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_REGION=us-east-1
   MAX_REQUESTS_PER_DAY=50
   MAX_GENERATIONS_PER_USER=10
   ```

2. **Installation**
   
   ```bash
   npm install
   ```

3. **Development**
   
   ```bash
   npm run dev
   ```

4. **Production**
   
   ```bash
   npm run build
   npm start
   ```

## Conversation Flow

1. User sends `/generate_logo`
2. Bot asks for business name
3. Bot asks for industry
4. Bot asks for style preferences
5. Bot generates 4 logo options
6. User selects a logo or regenerates
7. Bot generates high-resolution version
8. Bot offers to create a brand guide

## Architecture

- **Scene-based Flow**: Uses Telegraf scenes for conversation management
- **Service Layer**: Separates responsibilities for OpenAI, Redis, and S3
- **Middleware**: Applies context boundary rules from development standards
- **Type Safety**: Strong TypeScript typing throughout the codebase

## Best Practices

This implementation follows the development standards outlined in the cursor rules:

- Strong TypeScript typing
- Environment-based configuration
- Error handling for all async operations
- Rate limiting for API usage
- Security for asset storage
- Caching for session data

## Enhancement Roadmap

Future enhancements may include:

- Payment integration with Stripe
- Color palette customization
- PDF style guide generation
- Multiple language support
- Custom logo templates 


1. integrate DB, to save user session and user generated images. 
2. We are integrating Telegram star system to the bit, uses gets to generate images with their star token. 
3. users should be able to pick the number of images they want generated, for logo, stickers, and Memes and they should be able to pick the image quality, for the gpt-image-1 results, it come in three dimesions, so for only Meme generation, user should be able to pick which quality they want high, medium, and good. 
4. each image generation, should cost 50 telegram star, per image, so if you want more than 1 image, you do the calc,  for meme genration, high quality is 90 star medium is 70 and low is 50 telegram star, 
5. every one has 1 free image generation per user, once used, you have to have the telegram star balance. 


### 🧠 **Prompt Title:** Telegram Bot Image Generation System with Token Economy and DB Integration

---

### 🎭 **Role Specification:**

Act as a **full-stack AI system architect** integrating a Telegram-based image generation bot using GPT-based image models (e.g., `gpt-image-1`). Your goal is to design backend logic, session tracking, token economy, and image quality control features.

---

### 📚 **Context:**

You have developed a Telegram bot that allows users to generate AI images using their Telegram "star tokens" as currency. Each user has 1 free image generation; afterward, they must use tokens for further requests. The bot supports generating three types of content: logos, stickers, and memes—with memes supporting different image quality levels.

User data and generated images need to be persisted in a database for session management and future reference.

---

### 🎨 **Tone and Style:**

Professional, technical, and structured—appropriate for implementation by a developer.

---

### ⚙️ **System Requirements & Functional Specs:**

#### 1. **Database Integration**

* Use a database (e.g.MongoDB) to:

  * Store user profiles (user ID, token balance, generation history, free credit status).
  * Track session data (last command, generation request context).
  * Store metadata for each image generated (type, quality, cost, timestamp, image URL).

#### 2. **Telegram Star System Integration**

* Integrate with Telegram’s star/token system:

  * Deduct stars based on image generation requests.
  * Validate balance before processing requests.
  * Display remaining balance to user.
  * Give every new user **1 free image generation**.
  * Once free credit is used, enforce star-token deductions.

#### 3. **User Input Options**

* Allow users to:

  * Select **content type**: Logo, Sticker, Meme.
  * Choose **number of images** (1 to N).
  * For Memes only:

    * Select image **quality**: `High`, `Medium`, `Good`.

#### 4. **Pricing Rules**

* **Base Cost:**

  * 50 stars per image for Logo and Sticker.
* **Meme Quality Pricing (per image):**

  * Good (Low): 50 stars
  * Medium: 70 stars
  * High: 90 stars
* **Example Calculation Logic:**

  * If a user wants 3 memes at medium quality: `3 × 70 = 210 stars`.
  * If a user chooses 2 stickers: `2 × 50 = 100 stars`.

#### 5. **Free Generation Logic**

* Check if user has used their 1 free generation:

  * If not, allow one free image regardless of type or quality.
  * After use, token-based billing applies.
* Mark free generation status as "used" in the DB after use.

---

### 🧪 **Examples of Expected Interactions**

#### ✅ User Scenario 1:

* User selects "Sticker"
* Chooses 2 images
* Total cost = `2 × 50 = 100 stars`

#### ✅ User Scenario 2:

* User selects "Meme"
* Picks High Quality
* Chooses 1 image
* Total cost = `1 × 90 = 90 stars`

#### ✅ User Scenario 3 (Free Credit):

* New user selects "Logo"
* 1 image
* System detects unused free credit
* Total cost = `0 stars`

---

### 📥 **Developer Notes**

* Ensure error handling for insufficient balance.
* Provide feedback after each transaction:

  * “Success! 3 Medium-Quality Memes Generated. 210 Stars Deducted. New Balance: 440 Stars”
* Log each generation event in DB for analytics and audit.