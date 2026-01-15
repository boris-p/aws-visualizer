# AWS Visualizer

A hacky side project to visualize how AWS infrastructure actually works under the hood. Built for learning, breaking things (safely), and satisfying curiosity.

**[Try it live](https://boris-p.github.io/aws-visualizer/)**

## What is this?

Interactive simulations that show requests flowing through AWS infrastructure. Watch packets travel, see what happens when things fail, and build intuition for distributed systems—without the $500 AWS bill.

## Simulations

| Scenario                          | What you'll learn                                          |
| --------------------------------- | ---------------------------------------------------------- |
| **Basic Request Flow**            | How a request travels from user → CloudFront → your server |
| **AZ Failure (No Redundancy)**    | Why single-AZ deployments are scary                        |
| **AZ Failure with Failover**      | Multi-AZ saves the day                                     |
| **Round Robin Load Balancing**    | How ALB distributes traffic across instances               |
| **Burst Traffic & Queue Buildup** | Backpressure in action—watch queues grow                   |
| **RDS Write Quorum**              | How database writes get replicated                         |
| **RDS Read Scaling**              | Spreading read traffic across replicas                     |
| **Aurora Regional Failover**      | In progress                                                |

## Running locally

```bash
npm install
npm run dev
```

## Tech

React + Vite + TypeScript + D3 + XYFlow. Tailwind for styling. Framer Motion for animations.
