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
        usedSkillPoints
        hauntId
        collateral
        createdAt
      }
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

