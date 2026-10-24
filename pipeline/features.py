"""vtac-v1 feature encoder; parity checked against the TypeScript implementation."""
import math


def bucket(value):
    result = 0
    for char in value.lower():
        result = (result * 31 + ord(char)) & 0xFFFFFFFF
    return result % 16


def embed(spend, damage, kills, agents):
    v = [0.0] * 128
    v[:8] = [1, sum(spend) / 90000, min(spend, default=0) / 9000,
             max(spend, default=0) / 9000, sum(damage) / 10000,
             len(kills) / 10, sum(k['x'] is not None for k in kills) / 10,
             len(agents) / 10]
    for d in damage:
        v[8 + min(7, int(d // 100))] += .1
    for k in kills:
        if k['x'] is not None and k['y'] is not None:
            v[16 + min(7, int(k['y'] * 8)) * 8 + min(7, int(k['x'] * 8))] += .1
        v[80 + min(15, int(k['seconds'] // 10))] += .1
        v[96 + bucket(k['weapon'])] += .1
    for agent in agents:
        v[112 + bucket(agent)] += .1
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v]
