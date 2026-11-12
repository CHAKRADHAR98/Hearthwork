# Gather Protocol Frontend Testing Guide

## 🚀 Quick Start

1. **Start the frontend:**
```bash
cd app/frontend
npm run dev
```
2. **Open:** http://localhost:3000
3. **Connect wallet:** Click "Select Wallet" and choose Phantom/Solflare

---

## 📋 Testing Scenarios

### 1. **Admin Setup** (First Time)

**Prerequisites:** Your wallet must be the admin (`H1RnSuschFBmYSyKeZWAzyfqupjSuvCLLyuotQKH7MJB`)

**Steps:**
1. Connect your admin wallet
2. You should see "Admin" badge in header
3. Click "Create Market" button
4. Fill out the form:
   - **Market Name:** "Will BTC hit $100k by end of 2025?"
   - **Description:** "Bitcoin price prediction for end of 2025"
   - **Deadline:** Pick a future date (e.g., 2025-12-31 23:59)
   - **Liquidity Parameter:** 10 (default)
5. Click "Create Market"
6. Wait for transaction confirmation
7. Your new market should appear in the grid

---

### 2. **User Betting Flow**

**Prerequisites:** Any wallet with devnet SOL

**Steps:**
1. Connect a regular user wallet (not admin)
2. You should see the created markets
3. Click on any market card
4. You'll see:
   - Market details and description
   - YES/NO prediction bar showing current sentiment
   - "Buy Yes" and "Buy No" buttons
5. Click "Buy Yes" or "Buy No"
6. Enter the amount of SOL to bet
7. Confirm the transaction
8. Your shares should be reflected in the prediction bar

---

### 3. **Market Resolution** (Admin Only)

**Prerequisites:** Market deadline has passed

**Steps:**
1. Connect as admin wallet
2. Find an expired market (shows "(Expired)" in red)
3. Admin section appears at bottom of market card
4. Click "Resolve Yes" or "Resolve No"
5. Confirm transaction
6. Market status changes to "Resolved"
7. Winners can now claim rewards

---

### 4. **Claiming Winnings**

**Prerequisites:** Market is resolved and you have winning shares

**Steps:**
1. Connect wallet that holds winning shares
2. Find resolved market
3. Click "Claim Rewards" button
4. Confirm transaction
5. SOL rewards transferred to your wallet

---

## 🔍 Testing Checklist

### ✅ Basic Functionality
- [ ] Wallet connects/disconnects properly
- [ ] Admin badge shows for admin wallet
- [ ] Markets load and display correctly
- [ ] Create market modal opens/closes
- [ ] Market creation succeeds (admin)
- [ ] Buy shares buttons work
- [ ] Prediction bars update after bets
- [ ] Market resolution works (admin)
- [ ] Claim rewards works (users)

### ✅ Edge Cases
- [ ] Empty state shows when no markets
- [ ] Loading states work properly
- [ ] Error handling for insufficient funds
- [ ] Expired markets show resolve options
- [ ] Non-admin users can't see admin features

---

## 🛠️ Debugging Tips

### Check Console Logs
```javascript
// Open browser dev tools (F12)
// Look for:
// - Wallet connection errors
// - Transaction failures
// - Network issues
```

### Common Issues & Solutions

**"Transaction failed"**
- Check if wallet has enough devnet SOL
- Verify you're on devnet in wallet settings
- Try refreshing the page

**"Can't see admin features"**
- Verify you're using the correct admin wallet
- Check if config was initialized properly
- Try reconnecting wallet

**"Markets not loading"**
- Check network connection
- Verify program ID matches deployed contract
- Look for console errors

**"Hydration errors"**
- Refresh the page
- Clear browser cache
- Check if wallet extension is interfering

---

## 📱 Mobile Testing

1. **Responsive Design:**
   - Test on different screen sizes
   - Verify wallet modal works on mobile
   - Check market cards display properly

2. **Wallet Integration:**
   - Test with mobile wallet apps
   - Verify deep linking works
   - Check transaction signing flow

---

## 🔄 Advanced Testing

### Multiple Markets
1. Create several markets with different:
   - Deadlines (short/long term)
   - Liquidity parameters
   - Topics (sports, crypto, politics)

### High Volume
1. Test with multiple users betting
2. Verify prediction bars update correctly
3. Check for race conditions

### Edge Cases
1. Try to bet after deadline
2. Attempt to resolve before deadline
3. Test with very small/large amounts

---

## 📊 Monitoring

### Transaction Monitoring
```bash
# Check your transactions on Solana Explorer
https://solscan.io/?cluster=devnet
```

### Program Logs
```bash
# Check program logs
solana logs BZ21yPSaWuGgpwaHT9yAZ5KUoGjNZ5R2fFukhhcZQiKg --url devnet
```

---

## 🎯 Success Criteria

Your frontend is working correctly when:
1. ✅ Admin can create markets
2. ✅ Users can buy YES/NO shares
3. ✅ Prediction bars update in real-time
4. ✅ Admin can resolve expired markets
5. ✅ Winners can claim rewards
6. ✅ All states handle gracefully
7. ✅ Mobile responsive design works

---

## 🚨 Troubleshooting

**Frontend won't start:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Can't connect wallet:**
- Check wallet is unlocked
- Verify devnet network in wallet
- Try different browser

**Transactions failing:**
- Check devnet SOL balance
- Verify program is deployed
- Look for specific error messages

---

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify all prerequisites are met
3. Test with different wallets
4. Review transaction details on Solscan

Happy testing! 🎉
