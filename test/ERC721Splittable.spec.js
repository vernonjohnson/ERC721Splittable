const { expect } = require('chai')
const { ethers } = require('hardhat')
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree')

const GENESIS = [
  ['0', 'uri-gen0', ['0', '1']],
  ['1', 'uri-gen1', ['2']]
]

const GENESIS_SPLITS = [
  [
    ['0', 'uri-comb0', ['0']],
    ['1', 'uri-comb1', ['1']]
  ],
  // Invalid split for testing
  [
    ['2', 'uri-comb2', ['2']]
  ]
]

const COMBINATIONS = [
  ['0', 'uri-comb0', ['0']],
  ['1', 'uri-comb1', ['1']],
  ['2', 'uri-comb2', ['2']],
  ['3', 'uri-comb3', ['0', '1']],
  ['4', 'uri-comb4', ['0', '2']],
  ['5', 'uri-comb5', ['1', '2']],
  ['6', 'uri-comb6', ['0', '1', '2']]
]

const GENESIS_TREE = StandardMerkleTree.of(GENESIS, ['uint256', 'string', 'uint256[]'])

const COMBINATIONS_TREE = StandardMerkleTree.of(COMBINATIONS, ['uint256', 'string', 'uint256[]'])

const MAX_ATTRIBUTES = 250

describe('ERC721Splittable', function () {
  describe('mint()', function () {
    let erc721Splittable

    beforeEach('deploy', async function () {
      const ERC721Splittable = await ethers.getContractFactory('ERC721Splittable')
      erc721Splittable = await ERC721Splittable.deploy('ERC721Splittable', 'ERC721Splittable', GENESIS_TREE.root, COMBINATIONS_TREE.root, MAX_ATTRIBUTES)
      await erc721Splittable.deployed()
    })

    it('should process mint', async function () {
      for (const [i, v] of GENESIS_TREE.entries()) {
        const [owner] = await ethers.getSigners()
        const proof = await GENESIS_TREE.getProof(i)
        const [index, uri, attrs] = v
        await erc721Splittable.mint(owner.address, proof, index, uri, attrs)
        const isClaimed = await erc721Splittable.isClaimed(i)
        expect(isClaimed).to.be.true // eslint-disable-line no-unused-expressions
        expect(erc721Splittable.ownerOf(i)).to.eventually.eq(owner.address)
        expect(erc721Splittable.tokenURI(i)).to.eventually.eq(uri)
        expect(erc721Splittable.attributes(i)).to.eventually.eq(attrs)
      }
    })

    it('should reject if proof is invalid', async function () {
      for (const [i, v] of GENESIS_TREE.entries()) {
        const [owner] = await ethers.getSigners()
        const proof = await GENESIS_TREE.getProof(i)
        const [, uri, attrs] = v
        await expect(
          erc721Splittable.mint(owner.address, proof, 3, uri, attrs)
        ).to.be.revertedWith('ERC721Splittable: Invalid merkle proof')
      }
    })

    it('should reject if already minted', async function () {
      for (const [i, v] of GENESIS_TREE.entries()) {
        const [owner] = await ethers.getSigners()
        const proof = await GENESIS_TREE.getProof(i)
        const [index, uri, attrs] = v
        await erc721Splittable.mint(owner.address, proof, index, uri, attrs)

        await expect(
          erc721Splittable.mint(owner.address, proof, index, uri, attrs)
        ).to.be.revertedWith('ERC721Splittable: Token already claimed')
      }
    })
  })

  describe('split()', function () {
    let erc721Splittable

    beforeEach('deploy', async function () {
      const ERC721Splittable = await ethers.getContractFactory('ERC721Splittable')
      erc721Splittable = await ERC721Splittable.deploy('ERC721Splittable', 'ERC721Splittable', GENESIS_TREE.root, COMBINATIONS_TREE.root, MAX_ATTRIBUTES)
      await erc721Splittable.deployed()

      for (const [i, v] of GENESIS_TREE.entries()) {
        const [owner] = await ethers.getSigners()
        const proof = await GENESIS_TREE.getProof(i)
        const [index, uri, attrs] = v
        await erc721Splittable.mint(owner.address, proof, index, uri, attrs)
      }
    })

    it('should process split', async function () {
      const [owner] = await ethers.getSigners()
      const splits = GENESIS_SPLITS[0]
      const indices = []
      const proofs = []
      const uris = []
      for (const s of splits) {
        const [index, uri] = s
        indices.push(index)
        const proof = COMBINATIONS_TREE.getProof(Number(index))
        proofs.push(proof)
        uris.push(uri)
      }
      await erc721Splittable.split(owner.address, 0, proofs, indices, uris)
      await expect(erc721Splittable.ownerOf(0)).to.be.revertedWith('ERC721: invalid token ID')

      for (const s of splits) {
        let [index, uri] = s
        index = Number(index)
        const attrs = COMBINATIONS[0][index]
        expect(erc721Splittable.ownerOf(index)).to.eventually.eq(owner.address)
        expect(erc721Splittable.tokenURI(index)).to.eventually.eq(uri)
        expect(erc721Splittable.attributes(index)).to.eventually.eq(attrs)
      }
    })

    it('should reject if splitting attribute', async function () {
      const [owner] = await ethers.getSigners()
      const splits = GENESIS_SPLITS[1]
      const indices = []
      const proofs = []
      const uris = []
      for (const s of splits) {
        const [index, uri] = s
        indices.push(index)
        const proof = COMBINATIONS_TREE.getProof(Number(index))
        proofs.push(proof)
        uris.push(uri)
      }

      await expect(
        erc721Splittable.split(owner.address, 1, proofs, indices, uris)
      ).to.be.revertedWith('ERC721Splittable: Cannot split individual attributes')
    })

    it('should reject if splitting with wrong metadata', async function () {
      const [owner] = await ethers.getSigners()
      const splits = GENESIS_SPLITS[0]
      const indices = []
      const proofs = []
      const uris = []
      for (const s of splits) {
        const [index, uri] = s
        indices.push(index)
        const proof = COMBINATIONS_TREE.getProof(Number(index))
        proofs.push(proof)
        uris.push(uri)
      }

      await expect(
        erc721Splittable.split(owner.address, 0, proofs, [], [])
      ).to.be.revertedWith('ERC721Splittable: invalid length for inputs')
    })

    it('should reject if not owner', async function () {
      const [, user1] = await ethers.getSigners()
      const splits = GENESIS_SPLITS[0]
      const indices = []
      const proofs = []
      const uris = []
      for (const s of splits) {
        const [index, uri] = s
        indices.push(index)
        const proof = COMBINATIONS_TREE.getProof(Number(index))
        proofs.push(proof)
        uris.push(uri)
      }
      await expect(
        erc721Splittable.connect(user1).split(user1.address, 0, proofs, indices, uris)
      ).to.be.revertedWith('ERC721Splittable: Caller is not token owner or approved')
    })
  })

  describe('combine()', function () {
    let erc721Splittable

    beforeEach('deploy', async function () {
      const ERC721Splittable = await ethers.getContractFactory('ERC721Splittable')
      erc721Splittable = await ERC721Splittable.deploy('ERC721Splittable', 'ERC721Splittable', GENESIS_TREE.root, COMBINATIONS_TREE.root, MAX_ATTRIBUTES)
      await erc721Splittable.deployed()

      for (const [i, v] of GENESIS_TREE.entries()) {
        const [owner] = await ethers.getSigners()
        const proof = await GENESIS_TREE.getProof(i)
        const [index, uri, attrs] = v
        await erc721Splittable.mint(owner.address, proof, index, uri, attrs)
      }

      const [owner] = await ethers.getSigners()
      const splits = GENESIS_SPLITS[0]
      const indices = []
      const proofs = []
      const uris = []
      for (const s of splits) {
        const [index, uri] = s
        indices.push(index)
        const proof = COMBINATIONS_TREE.getProof(Number(index))
        proofs.push(proof)
        uris.push(uri)
      }
      await erc721Splittable.split(owner.address, 0, proofs, indices, uris)
    })

    it('should process combine', async function () {
      const [owner] = await ethers.getSigners()
      const tokenIds = [2, 3]
      const index = 3
      const proof = COMBINATIONS_TREE.getProof(index)
      const uri = COMBINATIONS[index][1]
      const attrs = COMBINATIONS[index][2]
      await erc721Splittable.combine(owner.address, tokenIds, proof, 3, uri, attrs)

      for (const tokenId of tokenIds) {
        await expect(erc721Splittable.ownerOf(tokenId)).to.be.revertedWith('ERC721: invalid token ID')
      }

      const outTokenId = 4
      expect(erc721Splittable.ownerOf(outTokenId)).to.eventually.eq(owner.address)
      expect(erc721Splittable.tokenURI(outTokenId)).to.eventually.eq(uri)
      expect(erc721Splittable.attributes(outTokenId)).to.eventually.eq(attrs)
    })

    it('should reject if combining with wrong metadata', async function () {
      const [owner] = await ethers.getSigners()
      const tokenIds = [2, 3]
      const index = 3
      const proof = COMBINATIONS_TREE.getProof(index)
      const uri = []
      const attrs = []
      await expect(erc721Splittable.combine(owner.address, tokenIds, proof, 3, uri, attrs)).to.be.revertedWith('ERC721Splittable: Invalid attributes specified')
    })

    it('should reject if not owner', async function () {
      const [, user1] = await ethers.getSigners()
      const tokenIds = [2, 3]
      const index = 3
      const proof = COMBINATIONS_TREE.getProof(index)
      const uri = COMBINATIONS[index][1]
      const attrs = COMBINATIONS[index][2]
      await expect(erc721Splittable.connect(user1).combine(user1.address, tokenIds, proof, 3, uri, attrs)).to.be.revertedWith('ERC721Splittable: Caller is not token owner or approved')
    })
  })
})
