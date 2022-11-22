// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract ERC721Splittable is ERC721URIStorage {
    uint256 private _nextTokenId;
    bytes32 private _genesisMerkleRoot;
    bytes32 private _combinationsMerkleRoot;
    uint256 private immutable _maxAttributes;
    
    mapping(uint256 => uint256[]) private _attributes;
    mapping(uint256 => uint256) private _claimedBitMap;

    constructor(
        string memory name_,
        string memory symbol_,
        bytes32 genesisMerkleRoot_,
        bytes32 combinationsMerkleRoot_,
        uint256 maxAttributes_
    )  ERC721(name_, symbol_) {
        _genesisMerkleRoot = genesisMerkleRoot_;
        _combinationsMerkleRoot = combinationsMerkleRoot_;
        _maxAttributes = maxAttributes_;
    }

    function isClaimed(uint256 index) public view returns (bool) {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        uint256 claimedWord = _claimedBitMap[claimedWordIndex];
        uint256 mask = (1 << claimedBitIndex);
        return claimedWord & mask == mask;
    }

    function _setClaimed(uint256 index) private {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        _claimedBitMap[claimedWordIndex] = _claimedBitMap[claimedWordIndex] | (1 << claimedBitIndex);
    }

    function _setAttributes(uint256 tokenId, uint256[] memory attributes_) internal {
        require(_exists(tokenId), "ERC721Splittable: attributes set for nonexistent token");
        _attributes[tokenId] = attributes_;
    }

    function attributes (uint256 tokenId) public view returns (uint256[] memory) {
        _requireMinted(tokenId);
        return _attributes[tokenId];
    }

    function _mint(
        address to, 
        bytes32 merkleRoot,
        bytes32[] calldata proof,
        uint256 index,
        string calldata tokenURI, 
        uint256[] memory attributes_
        ) internal virtual {
            bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(index, tokenURI, attributes_))));
            require(MerkleProof.verifyCalldata(proof, merkleRoot, leaf), "ERC721Splittable: Invalid merkle proof");
            uint256 tokenId = _nextTokenId;
            _safeMint(to, tokenId);
            _setTokenURI(tokenId, tokenURI);
            _setAttributes(tokenId, attributes_);
            _nextTokenId += 1;
    }

    function mint(
        address to, 
        bytes32[] calldata proof,
        uint256 index,
        string calldata tokenURI, 
        uint256[] calldata attributes_
    ) external virtual { 
        require(!isClaimed(index), "ERC721Splittable: Token already claimed");
        _mint(to, _genesisMerkleRoot, proof, index, tokenURI, attributes_);
        _setClaimed(index);
    }

    function split(
        address to,
        uint256 tokenId,
        bytes32[][] calldata proofs, 
        uint256[] calldata indices,
        string[] calldata tokenURIs
    ) external {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC721Splittable: Caller is not token owner or approved");
        uint256[] memory attributes_ = attributes(tokenId);
        _burn(tokenId);
        delete _attributes[tokenId];
        require(attributes_.length > 1, "ERC721Splittable: Cannot split individual attributes");
        require(
            proofs.length == attributes_.length &&
            indices.length == attributes_.length && 
            tokenURIs.length == attributes_.length,
            "ERC721Splittable: invalid length for inputs"
        );

        for (uint256 i = 0; i < proofs.length; i++) {
            uint256[] memory mintAttrs = new uint256[](1);
            mintAttrs[0] = attributes_[i];
            _mint(to, _combinationsMerkleRoot, proofs[i], indices[i], tokenURIs[i], mintAttrs);
        }
    }

     function combine(
        address to, 
        uint256[] calldata tokenIds,
        bytes32[] calldata proof,
        uint256 index,
        string calldata tokenURI,
        uint256[] calldata attributes_
    ) external {
        uint256[] memory attrCountsMap = new uint256[](_maxAttributes);
        for (uint256 i = 0; i < attributes_.length; i++) {
            attrCountsMap[attributes_[i]] += 1;
        }
    
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            uint256[] memory tokenAttrs = attributes(tokenId);

            for (uint256 j = 0; j < tokenAttrs.length; j++) {
                require(
                    tokenAttrs[j] <= _maxAttributes && attrCountsMap[tokenAttrs[j]] > 0,
                    "ERC721Splittable: Invalid attributes specified"
                );
                attrCountsMap[tokenAttrs[j]] -= 1;
            } 
            require(
                _isApprovedOrOwner(_msgSender(), tokenId),
                "ERC721Splittable: Caller is not token owner or approved"
            );
            _burn(tokenId);
            delete _attributes[tokenId];   
        }
        _mint(to, _combinationsMerkleRoot, proof, index, tokenURI, attributes_);
    }
}
