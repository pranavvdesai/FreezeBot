import * as Client from '@storacha/client'
import { promises as fs } from 'fs'

/**
 * Uploads a file to Storacha and returns the CID.
 *
 * @param bundlePath The path to the file to upload.
 * @returns The CID of the uploaded file.
 */
export async function uploadBundleToStoracha(bundlePath: string): Promise<string> {
  console.log('Initializing Storacha client...')
  const client = await Client.create()
  console.log('Storacha client initialized.')

  const email = process.env.STORACHA_EMAIL
  if (!email) {
    throw new Error('STORACHA_EMAIL environment variable not set.')
  }

  try {
    console.log(`Logging in as ${email}...`)
    await client.login(email)
    console.log('Login successful.')
  } catch (error) {
    console.error('Storacha login failed:', error)
    throw new Error('Storacha login failed.')
  }

  try {
    console.log(`Reading file from path: ${bundlePath}`)
    const file = await fs.readFile(bundlePath)
    console.log('File read successfully.')

    console.log('Uploading file to Storacha...')
    const root = await client.uploadFile(new Blob([file]))
    console.log('File uploaded successfully.')

    const cid = root.toString()
    console.log(`Upload complete. CID: ${cid}`)

    return cid
  } catch (error) {
    console.error('Storacha upload failed:', error)
    throw new Error('Storacha upload failed.')
  }
}
