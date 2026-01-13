import type { Scenario } from '@/types/scenario'

import basicRequestFlow from './basic-request-flow.json'
import azFailureNoRedundancy from './az-failure-no-redundancy.json'
import azFailureWithFailover from './az-failure-with-failover.json'
import roundRobinLoadBalancing from './round-robin-load-balancing.json'
import azFailureFailoverDetailed from './az-failure-failover-detailed.json'
import burstTrafficQueueBuildup from './burst-traffic-queue-buildup.json'

export const scenarios: Scenario[] = [
  basicRequestFlow as Scenario,
  azFailureNoRedundancy as Scenario,
  azFailureWithFailover as Scenario,
  roundRobinLoadBalancing as Scenario,
  azFailureFailoverDetailed as Scenario,
  burstTrafficQueueBuildup as Scenario
]
