import { gql } from "urql";

// Active marketplace listings: borrower is null means listed but not yet rented.
// (timeAgreed is also null in this state; the subgraph stores nulls, not "0".)
// Cancelled and completed listings are filtered out. Cursor-paginated by id.
export const ACTIVE_LENDINGS = gql`
  query ActiveLendings($lastId: ID!, $first: Int!) {
    gotchiLendings(
      first: $first
      where: {
        cancelled: false
        completed: false
        borrower: null
        id_gt: $lastId
      }
      orderBy: id
      orderDirection: asc
    ) {
      id
      gotchiTokenId
      gotchiBRS
      period
      upfrontCost
      splitOwner
      splitBorrower
      splitOther
      whitelistId
      whitelist {
        id
        name
      }
      thirdPartyAddress
      lender
      originalOwner
      channellingAllowed
      timeCreated
      gotchi {
        id
        name
        hauntId
        level
        baseRarityScore
        modifiedRarityScore
        withSetsRarityScore
        kinship
        collateral
        numericTraits
        modifiedNumericTraits
        withSetsNumericTraits
        equippedWearables
      }
    }
  }
`;

// Historical lendings: anything agreed since `since`, regardless of completed status.
// Used for analytics (volume, price heatmap, leaderboards).
export const HISTORICAL_LENDINGS = gql`
  query HistoricalLendings($lastId: ID!, $first: Int!, $since: BigInt!) {
    gotchiLendings(
      first: $first
      where: {
        timeAgreed_gt: $since
        id_gt: $lastId
      }
      orderBy: id
      orderDirection: asc
    ) {
      id
      gotchiTokenId
      gotchiBRS
      period
      upfrontCost
      splitOwner
      splitBorrower
      splitOther
      whitelistId
      whitelist {
        id
        name
      }
      thirdPartyAddress
      lender
      originalOwner
      borrower
      channellingAllowed
      cancelled
      completed
      timeCreated
      timeAgreed
      timeEnded
      gotchi {
        id
        name
        hauntId
        level
        kinship
        baseRarityScore
        modifiedRarityScore
        withSetsRarityScore
        collateral
        numericTraits
        modifiedNumericTraits
        equippedWearables
      }
    }
  }
`;

// Whitelists this address belongs to (as borrower) OR owns (as creator).
// Used for: "show only listings I can rent" filter, "you're on this list" badge.
export const WHITELISTS_FOR_ADDRESS = gql`
  query WhitelistsForAddress($address: String!) {
    asMember: whitelists(
      first: 200
      where: { members_contains: [$address] }
    ) {
      id
      name
      ownerAddress
      maxBorrowLimit
    }
    asOwner: whitelists(
      first: 200
      where: { ownerAddress: $address }
    ) {
      id
      name
      ownerAddress
      maxBorrowLimit
    }
  }
`;

// Single lending detail
export const LENDING_BY_ID = gql`
  query LendingById($id: ID!) {
    gotchiLending(id: $id) {
      id
      gotchiTokenId
      gotchiBRS
      period
      upfrontCost
      splitOwner
      splitBorrower
      splitOther
      whitelistId
      whitelist {
        id
        name
      }
      thirdPartyAddress
      lender
      originalOwner
      borrower
      channellingAllowed
      cancelled
      completed
      timeCreated
      timeAgreed
      timeEnded
      gotchi {
        id
        name
        hauntId
        level
        baseRarityScore
        modifiedRarityScore
        withSetsRarityScore
        kinship
        collateral
        numericTraits
        modifiedNumericTraits
        withSetsNumericTraits
        equippedWearables
      }
    }
  }
`;
