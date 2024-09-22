'use client'

import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import {
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Card,
  CardHeader,
  CardBody,
  Heading,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Spinner,
  VStack,
  HStack,
  Text,
  Box,
  ChakraProvider,
  useToast,
} from "@chakra-ui/react"

const contractABI = [
  "function _currServerCount() public view returns (uint256)",
  "function _serverCountryList(uint256) public view returns (string)",
  "function payServerForAccess(inEuint8 _firstOctet, inEuint8 _secondOctet, inEuint8 _thirdOctet, inEuint8 _fourthOctet, uint256 _serverRequested) public"
]

const tokenABI = [
  "function increaseAllowance(address spender, uint256 addedValue) public returns (bool)"
]

const contractAddress = "0x289cE92A4350D84e9106ba426A2A12C28d75Abe1"
const tokenAddress = "0xe58080AA9f3D37BEefc41adcF15D527F2dc94dc3"
const rpcUrls = [
  "https://api.helium.fhenix.zone",
  "https://rpc.fhenix.zone",
  "https://fhenix-rpc.publicnode.com",
]

function FhenixContractUI() {
  const [provider, setProvider] = useState<ethers.providers.Provider | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)
  const [contract, setContract] = useState<ethers.Contract | null>(null)
  const [tokenContract, setTokenContract] = useState<ethers.Contract | null>(null)
  const [serverCount, setServerCount] = useState<number>(0)
  const [serverLocations, setServerLocations] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fhenixClient, setFhenixClient] = useState<any>(null)
  const toast = useToast()

  const initProvider = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    for (const rpcUrl of rpcUrls) {
      try {
        let web3Provider: ethers.providers.Provider

        if (typeof window !== 'undefined' && typeof window.ethereum !== 'undefined') {
          web3Provider = new ethers.providers.Web3Provider(window.ethereum)
        } else {
          web3Provider = new ethers.providers.JsonRpcProvider(rpcUrl)
        }

        // Test the provider by making a simple call
        await web3Provider.getNetwork()

        setProvider(web3Provider)
        const contract = new ethers.Contract(contractAddress, contractABI, web3Provider)
        setContract(contract)

        const tokenContract = new ethers.Contract(tokenAddress, tokenABI, web3Provider)
        setTokenContract(tokenContract)

        // Initialize fhenixjs client
        try {
          const fhenixModule = await import('fhenixjs')
          const client = await fhenixModule.createInstance(web3Provider)
          setFhenixClient(client)
        } catch (fhenixError) {
          console.error("Failed to initialize fhenixjs:", fhenixError)
          // Continue without fhenixjs functionality
        }

        await fetchContractData(contract)
        setIsLoading(false)
        return // Exit the loop if successful
      } catch (error) {
        console.error(`Failed to initialize provider with RPC ${rpcUrl}:`, error)
      }
    }

    setIsLoading(false)
    setError("Failed to initialize provider. Please check your network connection and try again.")
  }, [])

  useEffect(() => {
    initProvider()
  }, [initProvider])

  const connectWallet = async () => {
    if (!provider) {
      setError("Provider is not initialized. Please refresh the page and try again.")
      return
    }

    try {
      if (provider instanceof ethers.providers.Web3Provider) {
        await (provider as ethers.providers.Web3Provider).send("eth_requestAccounts", [])
        const signer = (provider as ethers.providers.Web3Provider).getSigner()
        setSigner(signer)
        const connectedContract = contract?.connect(signer) || null
        setContract(connectedContract)
        const connectedTokenContract = tokenContract?.connect(signer) || null
        setTokenContract(connectedTokenContract)
        setIsConnected(true)
        setError(null)
        if (connectedContract) {
          await fetchContractData(connectedContract)
        }
      } else {
        setError("MetaMask is not available. Using read-only mode with RPC provider.")
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error)
      setError("Failed to connect wallet. Please try again.")
    }
  }

  const fetchContractData = async (contractToUse: ethers.Contract) => {
    try {
      const count = await contractToUse._currServerCount()
      setServerCount(count.toNumber())

      const locations = []
      for (let i = 0; i < count.toNumber(); i++) {
        const location = await contractToUse._serverCountryList(i)
        locations.push(location)
      }
      setServerLocations(locations)
    } catch (error) {
      console.error("Failed to fetch contract data:", error)
      setError("Failed to fetch contract data. Please check your network connection and try again.")
    }
  }

  const retryConnection = () => {
    setIsLoading(true)
    setError(null)
    initProvider()
  }

  const approveAndPayForAccess = async (serverId: number) => {
    if (!contract || !tokenContract || !fhenixClient || !signer) {
      toast({
        title: "Error",
        description: "Wallet not connected or contracts not initialized",
        status: "error",
        duration: 3000,
        isClosable: true,
      })
      return
    }

    try {
      // First, approve the token spending
      const allowanceAmount = ethers.utils.parseUnits("1000000000000000", 0)
      const approveTx = await tokenContract.increaseAllowance(contractAddress, allowanceAmount)
      await approveTx.wait()

      toast({
        title: "Approval Successful",
        description: "Token allowance increased for the contract",
        status: "success",
        duration: 3000,
        isClosable: true,
      })

      // Now proceed with the payment
      const eFirstOctet = await fhenixClient.encrypt(172, 'uint8')
      const eSecondOctet = await fhenixClient.encrypt(172, 'uint8')
      const eThirdOctet = await fhenixClient.encrypt(172, 'uint8')
      const eFourthOctet = await fhenixClient.encrypt(172, 'uint8')

      const payTx = await contract.payServerForAccess(
        eFirstOctet,
        eSecondOctet,
        eThirdOctet,
        eFourthOctet,
        serverId
      )

      await payTx.wait()

      toast({
        title: "Success",
        description: `Paid for access to server ${serverId}`,
        status: "success",
        duration: 3000,
        isClosable: true,
      })
    } catch (error) {
      console.error("Failed to approve or pay for server access:", error)
      toast({
        title: "Error",
        description: "Failed to approve or pay for server access. Please try again.",
        status: "error",
        duration: 3000,
        isClosable: true,
      })
    }
  }

  return (
    <Card maxW="4xl" mx="auto">
      <CardHeader>
        <Heading size="lg">Fhenix Network Smart Contract UI</Heading>
      </CardHeader>
      <CardBody>
        <VStack spacing={4} align="stretch">
          {error && (
            <Alert status="error">
              <AlertIcon />
              <AlertTitle mr={2}>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {isLoading ? (
            <HStack justify="center">
              <Spinner />
              <Text>Initializing...</Text>
            </HStack>
          ) : (
            <>
              <HStack justify="space-between">
                <Button onClick={connectWallet} isDisabled={!provider || isConnected}>
                  {isConnected ? "Wallet Connected" : "Connect Wallet"}
                </Button>
                <Button onClick={retryConnection} variant="outline">
                  Retry Connection
                </Button>
              </HStack>
              <Box>
                <Text fontWeight="bold">Total Servers: {serverCount}</Text>
              </Box>
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th>Server ID</Th>
                    <Th>Location</Th>
                    <Th>Action</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {serverLocations.map((location, index) => (
                    <Tr key={index}>
                      <Td>{index}</Td>
                      <Td>{location}</Td>
                      <Td>
                        <Button
                          onClick={() => approveAndPayForAccess(index)}
                          isDisabled={!isConnected || !fhenixClient}
                          size="sm"
                          colorScheme="blue"
                        >
                          Approve & Pay for Access
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </>
          )}
        </VStack>
      </CardBody>
    </Card>
  )
}

export default function Home() {
  return (
    <ChakraProvider>
      <FhenixContractUI />
    </ChakraProvider>
  )
}
