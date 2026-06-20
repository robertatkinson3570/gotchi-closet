import { gql } from "urql";

// Lendings I created (as lender) — active + ended
export const MY_LENDINGS_AS_LENDER = gql`
  query MyLendingsAsLender($address: Bytes!) {
    gotchiLendings(
      first: 500
      where: { lender: $address }
      orderBy: timeCreated
      orderDirection: desc
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
      borrower
      cancelled
      completed
      channellingAllowed
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
        withSetsNumericTraits
        equippedWearables
      }
    }
  }
`;

// Lendings I rented (as borrower)
export const MY_LENDINGS_AS_BORROWER = gql`
  query MyLendingsAsBorrower($address: Bytes!) {
    gotchiLendings(
      first: 500
      where: { borrower: $address }
      orderBy: timeAgreed
      orderDirection: desc
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
      lender
      cancelled
      completed
      channellingAllowed
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
        withSetsNumericTraits
        equippedWearables
      }
    }
  }
`;
