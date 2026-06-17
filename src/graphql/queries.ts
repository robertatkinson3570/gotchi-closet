import { gql } from "urql";

export const GOTCHIS_BY_OWNER = gql`
  query GotchisByOwner($owner: ID!) {
    user(id: $owner) {
      id
      gotchisOwned {
        id
        name
        level
        numericTraits
        modifiedNumericTraits
        withSetsNumericTraits
        equippedWearables
        baseRarityScore
        modifiedRarityScore
        withSetsRarityScore
        usedSkillPoints
        hauntId
        collateral
        createdAt
        lending
        kinship
      }
      gotchisLentOut
    }
    _meta {
      block {
        number
      }
    }
  }
`;

// Fetch full gotchi entities by token id — used to resolve a user's lent-out
// gotchis, which live under `gotchisLentOut` (ids only) because ownership moves
// to the lending escrow during an active rental.
export const GOTCHIS_BY_IDS = gql`
  query GotchisByIds($ids: [ID!]) {
    aavegotchis(first: 1000, where: { id_in: $ids }) {
      id
      name
      level
      numericTraits
      modifiedNumericTraits
      withSetsNumericTraits
      equippedWearables
      baseRarityScore
      modifiedRarityScore
      withSetsRarityScore
      usedSkillPoints
      hauntId
      collateral
      createdAt
      kinship
    }
  }
`;

export const GOTCHI_BY_TOKEN_ID = gql`
  query GotchiByTokenId($tokenId: BigInt!) {
    aavegotchis(
      first: 1
      where: { gotchiId: $tokenId, status: 3 }
    ) {
      id
      name
      level
      numericTraits
      modifiedNumericTraits
      withSetsNumericTraits
      equippedWearables
      baseRarityScore
      usedSkillPoints
      hauntId
      collateral
      createdAt
    }
    _meta {
      block {
        number
      }
    }
  }
`;

export const GOTCHIS_SEARCH = gql`
  query GotchisSearch($search: String!, $first: Int!) {
    aavegotchis(
      first: $first
      where: { name_contains_nocase: $search, status: 3 }
      orderBy: baseRarityScore
      orderDirection: desc
    ) {
      id
      name
      level
      numericTraits
      modifiedNumericTraits
      withSetsNumericTraits
      equippedWearables
      baseRarityScore
      usedSkillPoints
      hauntId
      collateral
      createdAt
    }
    _meta {
      block {
        number
      }
    }
  }
`;

export const WEARABLES = gql`
  query Wearables($first: Int!, $skip: Int!) {
    itemTypes(
      first: $first
      skip: $skip
      where: { category: 0 }
      orderBy: name
      orderDirection: asc
    ) {
      id
      name
      traitModifiers
      slotPositions
      rarityScoreModifier
      category
    }
  }
`;

export const WEARABLE_SETS = gql`
  query WearableSets($first: Int!, $skip: Int!) {
    wearableSets(
      first: $first
      skip: $skip
      orderBy: name
      orderDirection: asc
    ) {
      id
      name
      wearableIds
      traitBonuses
    }
  }
`;

