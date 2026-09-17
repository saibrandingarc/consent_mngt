import type { Prisma, PrismaClient } from '@prisma/client';
import { toJsonString, toOptionalJsonString } from '../json-array';

export class AiRepository {
  constructor(private readonly prisma: PrismaClient) {}

  createSuggestion(data: {
    organizationId: string;
    domainId: string;
    suggestionType: Prisma.AiSuggestionCreateInput['suggestionType'];
    targetType: string;
    targetId?: string | null;
    confidence?: number | null;
    suggestion: Prisma.InputJsonValue;
    evidence?: Prisma.InputJsonValue;
    createdBy?: string | null;
  }) {
    return this.prisma.aiSuggestion.create({
      data: {
        organizationId: data.organizationId,
        domainId: data.domainId,
        suggestionType: data.suggestionType,
        targetType: data.targetType,
        targetId: data.targetId ?? null,
        confidence: data.confidence ?? null,
        suggestion: toJsonString(data.suggestion),
        evidence: toOptionalJsonString(data.evidence),
        createdBy: data.createdBy ?? 'system',
        status: 'PENDING',
      },
    });
  }

  listSuggestions(domainId: string, status?: string) {
    return this.prisma.aiSuggestion.findMany({
      where: {
        domainId,
        ...(status ? { status: status as Prisma.AiSuggestionWhereInput['status'] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  findSuggestionById(id: string) {
    return this.prisma.aiSuggestion.findUnique({ where: { id } });
  }

  updateSuggestionStatus(
    id: string,
    status: Prisma.AiSuggestionUpdateInput['status'],
    decidedBy?: string | null,
  ) {
    return this.prisma.aiSuggestion.update({
      where: { id },
      data: {
        status,
        decidedBy: decidedBy ?? null,
        decidedAt: new Date(),
      },
    });
  }

  createRegressionRun(data: {
    organizationId: string;
    domainId: string;
    overallStatus: 'PASS' | 'WARNING' | 'FAIL';
    scenarios: Prisma.InputJsonValue;
  }) {
    return this.prisma.regressionTestRun.create({
      data: {
        organizationId: data.organizationId,
        domainId: data.domainId,
        overallStatus: data.overallStatus,
        scenarios: toJsonString(data.scenarios),
      },
    });
  }

  listRegressionRuns(domainId: string, limit = 20) {
    return this.prisma.regressionTestRun.findMany({
      where: { domainId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
