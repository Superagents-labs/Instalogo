# 💰 Quick Pricing Reference

## Current Telegram Stars Pricing

| Credits | Stars | Discount | Notes |
|---------|-------|----------|-------|
| 100 | 100 ⭐ | None | Starter pack |
| 500 | 500 ⭐ | None | Popular choice |
| 1000 | 950 ⭐ | **5% OFF** | Best value small |
| 2500 | 2250 ⭐ | **10% OFF** | Best value large |

## Generation Costs

- **Logo Generation**: 50 credits (2 concepts, 3 sizes each)
- **First Generation**: FREE for new users
- **Meme Generation**: Variable cost by quality
- **Sticker Generation**: Variable cost by quantity

## Technical Details

- **Currency**: `XTR` (Telegram Stars)
- **Provider Token**: Empty string `''`
- **Revenue**: Goes to bot owner's Telegram account
- **Withdrawal**: Convert Stars to money via Telegram

## Code Reference

```typescript
// Pricing logic in src/index.ts
switch(starsAmount) {
  case 100: starPrice = 100; break;   
  case 500: starPrice = 500; break;   
  case 1000: starPrice = 950; break; // 5% discount
  case 2500: starPrice = 2250; break; // 10% discount
}
```
