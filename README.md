# AWS Visualizer

A hacky side project to visualize how AWS infrastructure actually works under the hood. Built for learning, breaking things (safely), and satisfying curiosity.

**[Try it live](https://boris-p.github.io/aws-visualizer/)**

## What is this?

Interactive simulations that show requests flowing through AWS infrastructure. Watch packets travel, see what happens when things fail, and build intuition for distributed systems—without the $500 AWS bill.

## Simulations

| Scenario | What you'll learn |
| -------- | ----------------- |
| [Basic Request Flow](https://boris-p.github.io/aws-visualizer/?scenario=basic-request-flow) | How a request travels from user → CloudFront → your server |
| [AZ Failure (No Redundancy)](https://boris-p.github.io/aws-visualizer/?scenario=az-failure-no-redundancy) | Why single-AZ deployments are scary |
| [AZ Failure with Failover](https://boris-p.github.io/aws-visualizer/?scenario=az-failure-with-failover) | Multi-AZ saves the day |
| [Round Robin Load Balancing](https://boris-p.github.io/aws-visualizer/?scenario=round-robin-load-balancing) | How ALB distributes traffic across instances |
| [Burst Traffic & Queue Buildup](https://boris-p.github.io/aws-visualizer/?scenario=burst-traffic-queue-buildup) | Backpressure in action—watch queues grow |
| [RDS Write Quorum](https://boris-p.github.io/aws-visualizer/?scenario=rds-write-quorum) | How database writes get replicated |
| [RDS Read Scaling](https://boris-p.github.io/aws-visualizer/?scenario=rds-read-scaling) | Spreading read traffic across replicas |
| Aurora Regional Failover | In progress |

## Running locally

```bash
npm install
npm run dev
```

## Tech

React + Vite + TypeScript + D3 + XYFlow. Tailwind for styling. Framer Motion for animations.
