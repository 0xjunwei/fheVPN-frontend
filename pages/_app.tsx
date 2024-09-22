import { AppProps } from 'next/app'
import { useEffect, useState } from 'react'
import { ChakraProvider } from '@chakra-ui/react'

function MyApp({ Component, pageProps }: AppProps) {
  const [fhenix, setFhenix] = useState<any>(null)

  useEffect(() => {
    import('fhenixjs').then((module) => {
      setFhenix(module)
    })
  }, [])

  return (
    <ChakraProvider>
      <Component {...pageProps} fhenix={fhenix} />
    </ChakraProvider>
  )
}

export default MyApp