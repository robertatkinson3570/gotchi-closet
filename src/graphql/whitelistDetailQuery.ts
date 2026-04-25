import { gql } from "urql";

export const WHITELIST_DETAIL = gql`
  query WhitelistDetail($id: ID!) {
    whitelist(id: $id) {
      id
      name
      ownerAddress
      maxBorrowLimit
      members
    }
  }
`;
