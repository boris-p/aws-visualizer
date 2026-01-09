export interface AZ {
  id: string
  letters: string[]
}

export interface Region {
  id: string
  name: string
  lat: number
  lon: number
  azs: AZ[]
}

export type PartitionId = 'aws' | 'aws-cn' | 'aws-us-gov'

export interface Partition {
  id: PartitionId
  label: string
  color: string
  regions: Region[]
}

export interface AWSGeoData {
  partitions: Partition[]
}
