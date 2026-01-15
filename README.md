# AWS Visualizer

A hacky side project to visualize how AWS infrastructure actually works under the hood. Built for learning, breaking things (safely), and satisfying curiosity.

**[Try it live](https://boris-p.github.io/aws-visualizer/)**

## What is this?

Interactive simulations that show requests flowing through AWS infrastructure. Watch packets travel, see what happens when things fail, and build intuition for distributed systems—without the AWS bill.

**Note:** This isn't meant to be 100% accurate or up-to-date with AWS internals—it's a learning tool for building mental models. More scenarios will be added sporadically as I explore new concepts.

## Simulations

| Scenario                                                                                                                                               | What you'll learn                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [Basic Request Flow](https://boris-p.github.io/aws-visualizer/?graph=ec2-scenario-playground&scenario=basic-request-flow)                              | How a request travels from user → CloudFront → your server |
| [AZ Failure (No Redundancy)](https://boris-p.github.io/aws-visualizer/?graph=ec2-scenario-playground&scenario=az-failure-no-redundancy)                | Why single-AZ deployments are scary                        |
| [AZ Failure with Failover](https://boris-p.github.io/aws-visualizer/?graph=ec2-scenario-playground&scenario=az-failure-with-failover)                  | Multi-AZ saves the day                                     |
| [Round Robin Load Balancing](https://boris-p.github.io/aws-visualizer/?graph=ec2-scenario-playground-detailed&scenario=round-robin-load-balancing)     | How ALB distributes traffic across instances               |
| [Burst Traffic & Queue Buildup](https://boris-p.github.io/aws-visualizer/?graph=ec2-scenario-playground-detailed&scenario=burst-traffic-queue-buildup) | Backpressure in action—watch queues grow                   |
| [RDS Write Quorum](https://boris-p.github.io/aws-visualizer/?graph=rds-multi-az-cluster&scenario=rds-write-quorum)                                     | How database writes get replicated                         |
| [RDS AZ Failure Failover](https://boris-p.github.io/aws-visualizer/?graph=rds-multi-az-cluster&scenario=rds-az-failure-failover)                       | Database failover when an AZ goes down                     |
| [RDS Read Scaling](https://boris-p.github.io/aws-visualizer/?graph=rds-multi-az-cluster&scenario=rds-read-scaling)                                     | Spreading read traffic across replicas                     |
| Aurora Regional Failover                                                                                                                               | In progress                                                |

## Running locally

```bash
yarn
yarn dev
```

## Tech

React + Vite + TypeScript + D3 + XYFlow. Tailwind for styling. Framer Motion for animations.
