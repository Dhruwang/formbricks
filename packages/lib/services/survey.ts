import { prisma } from "@formbricks/database";
import { DatabaseError, ResourceNotFoundError, ValidationError } from "@formbricks/errors";
import {
  TSurvey,
  TSurveyAttributeFilter,
  TSurveyWithAnalytics,
  ZSurvey,
  ZSurveyWithAnalytics,
} from "@formbricks/types/v1/surveys";
import { Prisma } from "@prisma/client";
import { cache } from "react";
import "server-only";
import { z } from "zod";
import { captureTelemetry } from "../telemetry";

export const selectSurveyWithAnalytics = {
  id: true,
  createdAt: true,
  updatedAt: true,
  name: true,
  type: true,
  environmentId: true,
  status: true,
  questions: true,
  thankYouCard: true,
  displayOption: true,
  recontactDays: true,
  autoClose: true,
  closeOnDate: true,
  delay: true,
  autoComplete: true,
  redirectUrl: true,
  triggers: {
    select: {
      eventClass: {
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          environmentId: true,
          name: true,
          description: true,
          type: true,
          noCodeConfig: true,
        },
      },
    },
  },
  attributeFilters: {
    select: {
      id: true,
      attributeClassId: true,
      condition: true,
      value: true,
    },
  },
  displays: {
    select: {
      status: true,
      id: true,
    },
  },
  _count: {
    select: {
      responses: true,
    },
  },
};

export const selectSurvey = {
  id: true,
  createdAt: true,
  updatedAt: true,
  name: true,
  type: true,
  environmentId: true,
  status: true,
  questions: true,
  thankYouCard: true,
  displayOption: true,
  recontactDays: true,
  autoClose: true,
  closeOnDate: true,
  delay: true,
  autoComplete: true,
  redirectUrl: true,
  triggers: {
    select: {
      eventClass: {
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          environmentId: true,
          name: true,
          description: true,
          type: true,
          noCodeConfig: true,
        },
      },
    },
  },
  attributeFilters: {
    select: {
      id: true,
      attributeClassId: true,
      condition: true,
      value: true,
    },
  },
};

export const preloadSurveyWithAnalytics = (surveyId: string) => {
  void getSurveyWithAnalytics(surveyId);
};

export const getSurveyWithAnalytics = cache(
  async (surveyId: string): Promise<TSurveyWithAnalytics | null> => {
    let surveyPrisma;
    try {
      surveyPrisma = await prisma.survey.findUnique({
        where: {
          id: surveyId,
        },
        select: selectSurveyWithAnalytics,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new DatabaseError("Database operation failed");
      }

      throw error;
    }

    if (!surveyPrisma) {
      throw new ResourceNotFoundError("Survey", surveyId);
    }

    let { _count, displays, ...surveyPrismaFields } = surveyPrisma;

    const numDisplays = displays.length;
    const numDisplaysResponded = displays.filter((item) => item.status === "responded").length;
    const numResponses = _count.responses;
    // responseRate, rounded to 2 decimal places
    const responseRate = numDisplays ? Math.round((numDisplaysResponded / numDisplays) * 100) / 100 : 0;

    const transformedSurvey = {
      ...surveyPrismaFields,
      triggers: surveyPrismaFields.triggers.map((trigger) => trigger.eventClass),
      analytics: {
        numDisplays,
        responseRate,
        numResponses,
      },
    };

    try {
      const survey = ZSurveyWithAnalytics.parse(transformedSurvey);
      return survey;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(JSON.stringify(error.errors, null, 2)); // log the detailed error information
      }
      throw new ValidationError("Data validation of survey failed");
    }
  }
);

export const getSurvey = cache(async (surveyId: string): Promise<TSurvey | null> => {
  let surveyPrisma;
  try {
    surveyPrisma = await prisma.survey.findUnique({
      where: {
        id: surveyId,
      },
      select: selectSurvey,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError("Database operation failed");
    }

    throw error;
  }

  if (!surveyPrisma) {
    return null;
  }

  const transformedSurvey = {
    ...surveyPrisma,
    triggers: surveyPrisma.triggers.map((trigger) => trigger.eventClass),
  };

  try {
    const survey = ZSurvey.parse(transformedSurvey);
    return survey;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(JSON.stringify(error.errors, null, 2)); // log the detailed error information
    }
    throw new ValidationError("Data validation of survey failed");
  }
});

export const getSurveys = cache(async (environmentId: string): Promise<TSurvey[]> => {
  let surveysPrisma;
  try {
    surveysPrisma = await prisma.survey.findMany({
      where: {
        environmentId,
      },
      select: selectSurvey,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError("Database operation failed");
    }

    throw error;
  }

  const surveys: TSurvey[] = [];

  try {
    for (const surveyPrisma of surveysPrisma) {
      const transformedSurvey = {
        ...surveyPrisma,
        triggers: surveyPrisma.triggers.map((trigger) => trigger.eventClass),
      };
      const survey = ZSurvey.parse(transformedSurvey);
      surveys.push(survey);
    }
    return surveys;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(JSON.stringify(error.errors, null, 2)); // log the detailed error information
    }
    throw new ValidationError("Data validation of survey failed");
  }
});

export const getSurveysWithAnalytics = cache(
  async (environmentId: string): Promise<TSurveyWithAnalytics[]> => {
    let surveysPrisma;
    try {
      surveysPrisma = await prisma.survey.findMany({
        where: {
          environmentId,
        },
        select: selectSurveyWithAnalytics,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new DatabaseError("Database operation failed");
      }

      throw error;
    }

    try {
      const surveys: TSurveyWithAnalytics[] = [];
      for (const { _count, displays, ...surveyPrisma } of surveysPrisma) {
        const numDisplays = displays.length;
        const numDisplaysResponded = displays.filter((item) => item.status === "responded").length;
        const responseRate = numDisplays ? Math.round((numDisplaysResponded / numDisplays) * 100) / 100 : 0;

        const transformedSurvey = {
          ...surveyPrisma,
          triggers: surveyPrisma.triggers.map((trigger) => trigger.eventClass),
          analytics: {
            numDisplays,
            responseRate,
            numResponses: _count.responses,
          },
        };
        const survey = ZSurveyWithAnalytics.parse(transformedSurvey);
        surveys.push(survey);
      }
      return surveys;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(JSON.stringify(error.errors, null, 2)); // log the detailed error information
      }
      throw new ValidationError("Data validation of survey failed");
    }
  }
);

export async function updateSurvey(surveyId: string, updatedSurvey: TSurveyWithAnalytics) {
  let data: any = {};
  let body: Partial<any> = { ...updatedSurvey };

  if (updatedSurvey.triggers && updatedSurvey.triggers.length > 0) {
    const modifiedTriggers = updatedSurvey.triggers.map((trigger) => {
      if (typeof trigger === "object" && trigger.id) {
        return trigger.id;
      } else if (typeof trigger === "string" && trigger !== undefined) {
        return trigger;
      }
    });

    body = { ...updatedSurvey, triggers: modifiedTriggers };
  }

  const currentTriggers = await prisma.surveyTrigger.findMany({
    where: {
      surveyId,
    },
  });
  const currentAttributeFilters = await prisma.surveyAttributeFilter.findMany({
    where: {
      surveyId,
    },
  });

  delete body.updatedAt;
  // preventing issue with unknowingly updating analytics
  delete body.analytics;

  if (body.type === "link") {
    delete body.triggers;
    delete body.recontactDays;
    // converts JSON field with null value to JsonNull as JSON fields can't be set to null since prisma 3.0
    if (!body.surveyClosedMessage) {
      body.surveyClosedMessage = null;
    }
  }

  if (body.triggers) {
    const newTriggers: string[] = [];
    const removedTriggers: string[] = [];
    // find added triggers
    for (const eventClassId of body.triggers) {
      if (!eventClassId) {
        continue;
      }
      if (currentTriggers.find((t) => t.eventClassId === eventClassId)) {
        continue;
      } else {
        newTriggers.push(eventClassId);
      }
    }
    // find removed triggers
    for (const trigger of currentTriggers) {
      if (body.triggers.find((t: any) => t === trigger.eventClassId)) {
        continue;
      } else {
        removedTriggers.push(trigger.eventClassId);
      }
    }
    // create new triggers
    if (newTriggers.length > 0) {
      data.triggers = {
        ...(data.triggers || []),
        create: newTriggers.map((eventClassId) => ({
          eventClassId,
        })),
      };
    }
    // delete removed triggers
    if (removedTriggers.length > 0) {
      data.triggers = {
        ...(data.triggers || []),
        deleteMany: {
          eventClassId: {
            in: removedTriggers,
          },
        },
      };
    }
    delete body.triggers;
  }

  const attributeFilters: TSurveyAttributeFilter[] = body.attributeFilters;
  if (attributeFilters) {
    const newFilters: TSurveyAttributeFilter[] = [];
    const removedFilterIds: string[] = [];
    // find added attribute filters
    for (const attributeFilter of attributeFilters) {
      if (!attributeFilter.attributeClassId || !attributeFilter.condition || !attributeFilter.value) {
        continue;
      }
      if (
        currentAttributeFilters.find(
          (f) =>
            f.attributeClassId === attributeFilter.attributeClassId &&
            f.condition === attributeFilter.condition &&
            f.value === attributeFilter.value
        )
      ) {
        continue;
      } else {
        newFilters.push({
          attributeClassId: attributeFilter.attributeClassId,
          condition: attributeFilter.condition,
          value: attributeFilter.value,
        });
      }
    }
    // find removed attribute filters
    for (const attributeFilter of currentAttributeFilters) {
      if (
        attributeFilters.find(
          (f) =>
            f.attributeClassId === attributeFilter.attributeClassId &&
            f.condition === attributeFilter.condition &&
            f.value === attributeFilter.value
        )
      ) {
        continue;
      } else {
        removedFilterIds.push(attributeFilter.attributeClassId);
      }
    }
    // create new attribute filters
    if (newFilters.length > 0) {
      data.attributeFilters = {
        ...(data.attributeFilters || []),
        create: newFilters.map((attributeFilter) => ({
          attributeClassId: attributeFilter.attributeClassId,
          condition: attributeFilter.condition,
          value: attributeFilter.value,
        })),
      };
    }
    // delete removed triggers
    if (removedFilterIds.length > 0) {
      // delete all attribute filters that match the removed attribute classes
      await Promise.all(
        removedFilterIds.map(async (attributeClassId) => {
          await prisma.surveyAttributeFilter.deleteMany({
            where: {
              attributeClassId,
            },
          });
        })
      );
    }
    delete body.attributeFilters;
  }

  data = {
    ...data,
    ...body,
  };

  delete data.responseRate;
  delete data.numDisplays;

  try {
    const updatedSurvey = await prisma.survey.update({
      where: { id: surveyId },
      data,
    });

    if (!updatedSurvey) {
      return null;
    }

    return updatedSurvey;
  } catch (error) {
    console.log(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError("Database operation failed");
    }

    throw error;
  }
}

export async function deleteSurvey(surveyId: string) {
  const deletedSurvey = await prisma.survey.delete({
    where: {
      id: surveyId,
    },
    select: selectSurvey,
  });
  return deletedSurvey;
}

export async function createSurvey(environmentId: string, surveyBody: any) {
  const survey = await prisma.survey.create({
    data: {
      ...surveyBody,
      environment: {
        connect: {
          id: environmentId,
        },
      },
    },
  });
  captureTelemetry("survey created");

  return survey;
}
