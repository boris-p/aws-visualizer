import type { Scenario } from '@/types/scenario'

import basicRequestFlow from './basic-request-flow.json'
import azFailureNoRedundancy from './az-failure-no-redundancy.json'
import azFailureWithFailover from './az-failure-with-failover.json'
import roundRobinLoadBalancing from './round-robin-load-balancing.json'
import azFailureFailoverDetailed from './az-failure-failover-detailed.json'
import burstTrafficQueueBuildup from './burst-traffic-queue-buildup.json'
import rdsWriteQuorum from './rds-write-quorum.json'
import rdsAzFailureFailover from './rds-az-failure-failover.json'
import rdsReadScaling from './rds-read-scaling.json'
import auroraWriteFlow from './aurora-write-quorum.json'
import auroraRegionalFailover from './aurora-regional-failover.json'
import auroraReadScaling from './aurora-read-scaling.json'

export const scenarios: Scenario[] = [
  basicRequestFlow as Scenario,
  azFailureNoRedundancy as Scenario,
  azFailureWithFailover as Scenario,
  roundRobinLoadBalancing as Scenario,
  azFailureFailoverDetailed as Scenario,
  burstTrafficQueueBuildup as Scenario,
  rdsWriteQuorum as Scenario,
  rdsAzFailureFailover as Scenario,
  rdsReadScaling as Scenario,
  auroraWriteFlow as Scenario,
  auroraRegionalFailover as Scenario,
  auroraReadScaling as Scenario
]
