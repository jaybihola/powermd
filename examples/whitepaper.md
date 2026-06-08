---
title: Edge Caching at Scale
subtitle: A practical whitepaper on cutting tail latency
author: Platform Engineering
date: 2026-06-07
theme: slate
accent: "#a8632b"
toc: top
sticky-header: true
back-to-top: true
width: 760
heading-font: Georgia, "Times New Roman", serif
heading-scale: 1.1
line-height: 1.75
align: justify
playful: true
hero: false
---

## Abstract

This paper describes how we reduced p99 response time by **63%** across our
public API by moving cache decisions to the edge. We cover the architecture, the
rollout, and the trade-offs we accepted along the way.

> [!NOTE]
> All numbers below are from production traffic over a 30-day window, not a
> synthetic benchmark.

## Background

Our origin servers were healthy on average but suffered long tails: a small
fraction of requests waited on cold database reads. Averages hid the problem —
the people who felt it were our most active users.

:::columns
:::col
**Before**

- p50: 84 ms
- p99: 1,240 ms
- Origin CPU: 71%
:::
:::col
**After**

- p50: 79 ms
- p99: 458 ms
- Origin CPU: 44%
:::
:::

## Approach

We pushed three decisions to the edge:

1. **Cache admission** — only cache responses likely to be re-requested.
2. **Stale-while-revalidate** — serve slightly stale data while refreshing.
3. **Request coalescing** — collapse duplicate misses into one origin call.

```python
def should_cache(resp):
    # admit only idempotent, cacheable, frequently-read responses
    return resp.method == "GET" and resp.ttl > 0 and resp.read_rate > THRESHOLD
```

> [!WARNING] Coalescing has sharp edges
> If the single origin call fails, every coalesced waiter fails with it. We add
> jittered retries and a short circuit breaker to contain the blast radius.

## Results

| Metric            | Before   | After   | Change   |
|:------------------|---------:|--------:|---------:|
| p50 latency       |   84 ms  |  79 ms  |   −6%    |
| p99 latency       | 1,240 ms | 458 ms  |  −63%    |
| Origin CPU        |    71%   |   44%   |  −27 pts |
| Cache hit rate    |    —     |   88%   |    —     |

## Conclusion

Edge caching paid for itself within the first week. The biggest lesson was that
**tail latency is a product problem, not just an infra metric** — the wins were
felt most by the users who matter most.

:::tip
Start with stale-while-revalidate. It's the lowest-risk change and delivered
most of the gain on its own.
:::
