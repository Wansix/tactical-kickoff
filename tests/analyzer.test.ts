import { describe, expect, it } from 'vitest';
import { MatchSimulation } from '../src/simulation/MatchSimulation';
import { analyzeTelemetry } from '../src/simulation/SimulationAnalyzer';

describe('simulation inspection gate', () => {
  it('classifies a seeded 60-second run with causal movement evidence', () => {
    const match=new MatchSimulation(2025);
    match.start();
    for(let i=0;i<60*60;i++) match.tick(1/60);
    const report=analyzeTelemetry(match.getTelemetry(),match.field);
    expect(report.pass).toBe(true);
    expect(report.finite).toBe(true);
    expect(report.allRobotsMoved).toBe(true);
    expect(report.robotBallContacts).toBeGreaterThan(0);
    expect(report.maxBallRange).toBeGreaterThan(300);
    expect(report.findings).toEqual([]);
  });
});
