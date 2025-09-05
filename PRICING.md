# 💰 Pricing Documentation - BrandForge Bot

## 🌟 Current Pricing Structure (Telegram Stars)

### **Credit System**
The bot uses a **credit-based system** where users purchase **Logo Credits** using **Telegram Stars**.

- **1 Credit = 1 Logo Generation** (2 logo concepts per generation)
- **Credits are deducted** when generation starts
- **First generation is FREE** for new users

---

## 💸 **Pricing Tiers (Telegram Stars)**

| Package | Credits | Telegram Stars | Discount | Price per Credit |
|---------|---------|----------------|----------|------------------|
| **Starter** | 100 Credits | 100 ⭐ | None | 1.00 ⭐/credit |
| **Popular** | 500 Credits | 500 ⭐ | None | 1.00 ⭐/credit |
| **Pro** | 1000 Credits | 950 ⭐ | **5% OFF** | 0.95 ⭐/credit |
| **Business** | 2500 Credits | 2250 ⭐ | **10% OFF** | 0.90 ⭐/credit |

### **Volume Discounts:**
- 💡 **1000+ Credits**: 5% discount (save 50 Stars)
- 🎯 **2500+ Credits**: 10% discount (save 250 Stars)

---

## 🎨 **What Credits Include**

### **Per Generation (50 Credits):**
- ✅ **2 Logo Concepts** (different styles/approaches)
- ✅ **3 Sizes Each**: 1024x1024, 512x512, 256x256 pixels
- ✅ **High-Quality PNG** format with transparency
- ✅ **Cloud Storage** via Cloudinary CDN
- ✅ **Instant Download** links
- ✅ **Like/Dislike Feedback** system

### **Generation Types:**
- 🎨 **Logo Generation**: 50 credits per session
- 😂 **Meme Generation**: Variable cost based on quality
- 🖼️ **Sticker Generation**: Variable cost based on quantity

---

## 💳 **How Telegram Stars Work**

### **For Users:**
1. **Tap "Buy Credits"** in the bot
2. **Select package** (100, 500, 1000, or 2500 credits)
3. **Tap "Pay"** - Telegram handles the Star purchase
4. **Credits added instantly** to your account

### **Star Purchase Flow:**
```
User clicks "1000 Credits - 950 ⭐ (5% off)"
        ↓
Telegram shows Star purchase dialog
        ↓  
User buys 950 Stars from Telegram
        ↓
950 Stars deducted from user's Telegram balance
        ↓
1000 Credits added to bot account
        ↓
User can generate logos
```

---

## 📊 **Revenue Collection**

### **For Bot Owner:**
- **Revenue Location**: Your personal Telegram account
- **Access**: Telegram → Settings → Telegram Stars
- **Withdrawal**: Convert Stars to real money
- **Processing**: 1-7 business days
- **Minimum**: Usually 1,000 Stars for withdrawal

### **Revenue Flow:**
```
User Pays 950 ⭐ → Telegram → Your Account (950 ⭐)
```

---

## 🌍 **Multi-Language Pricing Display**

The pricing is displayed in **5 languages**:

| Language | Credits | Stars | Discount |
|----------|---------|-------|----------|
| **🇺🇸 English** | "100 Credits - 100 ⭐" | "1000 Credits - 950 ⭐ (5% off)" |
| **🇪🇸 Spanish** | "100 Créditos - 100 ⭐" | "1000 Créditos - 950 ⭐ (5% desc.)" |
| **🇫🇷 French** | "100 Crédits - 100 ⭐" | "1000 Crédits - 950 ⭐ (5% réduction)" |
| **🇷🇺 Russian** | "100 Кредитов - 100 ⭐" | "1000 Кредитов - 950 ⭐ (скидка 5%)" |
| **🇨🇳 Chinese** | "100积分 - 100 ⭐" | "1000积分 - 950 ⭐ (95折)" |

---

## ⚡ **Key Benefits of Telegram Stars**

### **Advantages:**
- ✅ **No external payment processors** (Stripe, PayPal, etc.)
- ✅ **Lower transaction fees** (just Telegram's cut)
- ✅ **Global reach** (works in all Telegram countries)
- ✅ **Instant payments** and credit delivery
- ✅ **Built-in fraud protection**
- ✅ **Seamless user experience** (no leaving Telegram)
- ✅ **Direct revenue** to bot owner's Telegram account

### **User Experience:**
- 💡 **Hint**: "Don't have Stars? Just tap Pay and Telegram will let you buy Stars instantly!"
- 🔄 **Balance Display**: "Your Credits: 120" (not "Star Balance")
- 📱 **Mobile-First**: Optimized for Telegram mobile apps

---

## 📈 **Pricing Strategy**

### **Free Tier:**
- **1 FREE Generation** for new users
- Encourages trial and conversion

### **Volume Pricing:**
- **Linear pricing** for small purchases (100, 500 credits)
- **Volume discounts** for larger purchases (1000+, 2500+)
- **Encourages bulk purchases** for better value

### **Psychological Pricing:**
- **Direct 1:1 ratio** for small amounts (easy to understand)
- **Clear discount percentages** (5%, 10%) for larger amounts
- **Round numbers** (100, 500, 1000, 2500) for simplicity

---

## 🔧 **Technical Implementation**

### **Payment Processing:**
```typescript
// Telegram Stars Invoice (XTR currency)
const invoice = {
  title: `${starsAmount} Logo Credits`,
  description: `Purchase ${starsAmount} ⭐ credits for AI logo generation`,
  provider_token: '',              // Empty for Telegram Stars
  currency: 'XTR',                 // Telegram Stars currency
  prices: [{ label: `${starsAmount} Credits`, amount: starPrice }],
};
```

### **Cost Deduction:**
```typescript
// 50 credits per logo generation (2 concepts)
const LOGO_GENERATION_COST = 50;
user.starBalance -= LOGO_GENERATION_COST;
```

---

## 📋 **Pricing FAQ**

### **Q: Why use Telegram Stars instead of USD?**
A: Simpler, faster, global reach, no external processors needed.

### **Q: Do prices vary by country?**
A: No, same Star amounts worldwide. Telegram handles local currency conversion.

### **Q: What happens if I run out of credits mid-generation?**
A: Generation won't start if insufficient credits. Balance is checked before processing.

### **Q: Can I get refunds?**
A: Refund policy follows Telegram's Star refund policies.

### **Q: How do I see my purchase history?**
A: Use the "My History" button in the bot for generation history.

---

*Last Updated: January 2025*
*Bot Version: 1.0.0*
*Payment System: Telegram Stars (XTR)*
