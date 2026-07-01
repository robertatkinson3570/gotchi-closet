# Gotchi Closet ↔ Aavegotchi Dapp Parity Implementation Plan

## USER REQUIREMENTS
- "Every page and functionality in gotchi closet should have just as much detail as the dapp"
- "Take full inventory, then add missing to gotchi closet"
- Specific issues noted:
  1. Explorer auctions tab NOT showing wearables up for auction
  2. Activity page NOT showing same details as the dapp

## AUDIT FINDINGS

### Issue 1: Explorer Auctions - Missing Wearable Details
**Current State:**
- AuctionGrid.tsx shows auctions via GBM subgraph
- Line 162-165: Wearables ARE rendered as `itemImageCandidates(a.tokenId)`
- BUT: No detailed item information (slot type, rarity, traits)

**Gap Analysis:**
- Dapp shows: Wearable image, slot type (head/body/hands/feet/pet), rarity tier, price, quantity available
- Closet shows: Only basic image + token ID
- Missing: Slot type badge, rarity color/indicator, detailed stats

**Required Implementation:**
1. Add wearable metadata enrichment query (fetch slot, rarity from subgraph)
2. Create WearableAuctionCard component with detailed display
3. Show rarity badges/colors matching dapp
4. Display slot type clearly

### Issue 2: Activity Page - Missing Item Details
**Current State:**
- ActivityPage.tsx fetches sales/offers/auctions
- Shows minimal data: item image, price, timestamp, status
- No Item details enrichment

**Gap Analysis:**
- Dapp shows: Item image, name, rarity, seller/buyer, price, timestamp, transaction hash
- Closet shows: Same basic list
- Missing: Item name/metadata, seller/buyer labels, rarity indicators, transaction context

**Required Implementation:**
1. Enrich activity rows with full item metadata
2. Batch-fetch wearable names, rarity, slot from subgraph
3. Add seller/buyer address labels  
4. Display rarity badges (matching dapp color scheme)
5. Show transaction type more clearly (Listed/Sold/Offer Made/Offer Accepted)

## IMPLEMENTATION ROADMAP

### Phase 1: Wearable Metadata Enhancement
- [ ] Create `lib/wearable-metadata.ts` - batch fetch wearable details
- [ ] Add to subgraph queries: name, baseRarity, slotPositionsIndex
- [ ] Create `WearableAuctionDetail` component
- [ ] Update AuctionGrid to show wearable details

### Phase 2: Activity Page Enrichment
- [ ] Add wearable metadata fetch to ActivityPage
- [ ] Create activity row detail cards with full item info
- [ ] Add rarity color indicators
- [ ] Add seller/buyer address display and links
- [ ] Format transaction types clearly

### Phase 3: Comprehensive Testing
- [ ] E2E tests comparing both sites
- [ ] Visual regression tests
- [ ] Data accuracy validation

## DAPP REFERENCE URLs
- Auctions: https://dapp.aavegotchi.com/baazaar/aavegotchis?status=auctioning
- Wearables Auctions: (same URL filtered to wearable type)
- Activity: (via subgraph pagination)

## KEY DATA FIELDS TO SYNC

### Wearable Display
- [ ] Slot Type: head, body, leftHand, rightHand, pet (slotPositionsIndex)
- [ ] Base Rarity: 1-5 (with color coding: common/uncommon/rare/epic/mythical)
- [ ] Name: From subgraph wearable entity
- [ ] Image: With transparent background
- [ ] Price in GHST
- [ ] Quantity available
- [ ] Traits it provides

### Activity Row Enhancement
- [ ] Item Image (proper sizing)
- [ ] Item Name
- [ ] Item Rarity Badge
- [ ] Transaction Type (Listed/Sold/Offer)
- [ ] From Address (seller)
- [ ] To Address (buyer)
- [ ] Price
- [ ] Timestamp (relative + absolute)
- [ ] Status (Open/Filled/Cancelled)
- [ ] Traits/Stats (for gotchis)

## TECHNICAL NOTES
- Use existing subgraph queries where possible
- Batch metadata fetches to avoid N+1 queries
- Cache wearable metadata (staleTime: 5m)
- Match dapp color scheme for rarity badges
- Maintain existing UI patterns (cards, grids)
