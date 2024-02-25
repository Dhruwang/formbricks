import { sendFreeLimitReachedEventToPosthogBiWeekly } from "@/app/api/v1/client/[environmentId]/in-app/sync/lib/posthog";
import { responses } from "@/app/lib/api/response";
import { transformErrorToDetails } from "@/app/lib/api/validator";
import { NextRequest } from "next/server";

import { getMultiLanguagePermission } from "@formbricks/ee/lib/service";
import { getActionClasses } from "@formbricks/lib/actionClass/service";
import { IS_FORMBRICKS_CLOUD, PRICING_APPSURVEYS_FREE_RESPONSES } from "@formbricks/lib/constants";
import { getEnvironment, updateEnvironment } from "@formbricks/lib/environment/service";
import { getProductByEnvironmentId } from "@formbricks/lib/product/service";
import {
  getSurveys,
  transformToLegacySurvey,
  transformToSurveyWithDefaultLanguageOnly,
} from "@formbricks/lib/survey/service";
import { getMonthlyTeamResponseCount, getTeamByEnvironmentId } from "@formbricks/lib/team/service";
import { TLegacySurvey } from "@formbricks/types/LegacySurvey";
import { TJsStateSync, ZJsPublicSyncInput } from "@formbricks/types/js";
import { TSurvey } from "@formbricks/types/surveys";

export async function OPTIONS(): Promise<Response> {
  return responses.successResponse({}, true);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { environmentId: string } }
): Promise<Response> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const version =
      searchParams.get("version") === "undefined" || searchParams.get("version") === null
        ? undefined
        : searchParams.get("version");
    const syncInputValidation = ZJsPublicSyncInput.safeParse({
      environmentId: params.environmentId,
    });

    if (!syncInputValidation.success) {
      return responses.badRequestResponse(
        "Fields are missing or incorrectly formatted",
        transformErrorToDetails(syncInputValidation.error),
        true
      );
    }

    const { environmentId } = syncInputValidation.data;

    const environment = await getEnvironment(environmentId);
    const team = await getTeamByEnvironmentId(environmentId);
    if (!team) {
      throw new Error("Team does not exist");
    }
    const isMultiLanguageAllowed = await getMultiLanguagePermission(team);

    if (!environment) {
      throw new Error("Environment does not exist");
    }

    // check if MAU limit is reached
    let isInAppSurveyLimitReached = false;
    if (IS_FORMBRICKS_CLOUD) {
      // check team subscriptons

      // check inAppSurvey subscription
      const hasInAppSurveySubscription =
        team.billing.features.inAppSurvey.status &&
        ["active", "canceled"].includes(team.billing.features.inAppSurvey.status);
      const currentResponseCount = await getMonthlyTeamResponseCount(team.id);
      isInAppSurveyLimitReached =
        !hasInAppSurveySubscription && currentResponseCount >= PRICING_APPSURVEYS_FREE_RESPONSES;
      if (isInAppSurveyLimitReached) {
        await sendFreeLimitReachedEventToPosthogBiWeekly(environmentId, "inAppSurvey");
      }
    }

    if (!environment?.widgetSetupCompleted) {
      await updateEnvironment(environment.id, { widgetSetupCompleted: true });
    }

    const [surveys, noCodeActionClasses, product] = await Promise.all([
      getSurveys(environmentId),
      getActionClasses(environmentId),
      getProductByEnvironmentId(environmentId),
    ]);

    if (!product) {
      throw new Error("Product not found");
    }
    // Define 'transformedSurveys' which can be an array of either TLegacySurvey or TSurvey.
    let transformedSurveys: TLegacySurvey[] | TSurvey[];

    // Common filter condition for selecting surveys that are in progress and of type 'web'.
    const inProgressWebSurveys = surveys.filter(
      (survey) => survey.status === "inProgress" && survey.type === "web"
    );

    if (!isMultiLanguageAllowed) {
      if (version) {
        // Scenario 1: Version available, multi-language not allowed
        // Convert to TSurvey with default language only.
        transformedSurveys = await Promise.all(
          inProgressWebSurveys.map(transformToSurveyWithDefaultLanguageOnly)
        );
      } else {
        // Scenario 2: No version, multi-language not allowed
        // Convert to legacy surveys with default language.
        transformedSurveys = await Promise.all(
          inProgressWebSurveys.map((survey) => transformToLegacySurvey(survey, "default"))
        );
      }
    } else {
      if (!version) {
        // Scenario 3: No version, multi-language allowed
        // Convert to legacy surveys with specified language or default if not specified.
        transformedSurveys = await Promise.all(
          inProgressWebSurveys.map((survey) => {
            const languageCode = "default";
            return transformToLegacySurvey(survey, languageCode);
          })
        );
      } else {
        // Scenario 4: Version available, multi-language allowed
        // Use the surveys as they are.
        transformedSurveys = inProgressWebSurveys;
      }
    }

    // Define a filter condition for surveys without segments or with empty segment filters.
    const filterCondition = (survey) =>
      survey.status === "inProgress" &&
      survey.type === "web" &&
      (!survey.segment || survey.segment.filters.length === 0);

    // Create the 'state' object with surveys, noCodeActionClasses, product, and person.
    const state: TJsStateSync = {
      surveys: isInAppSurveyLimitReached
        ? []
        : version
          ? (transformedSurveys as TSurvey[]).filter(filterCondition)
          : (transformedSurveys as TLegacySurvey[]).filter(filterCondition),
      noCodeActionClasses: noCodeActionClasses.filter((actionClass) => actionClass.type === "noCode"),
      product,
      person: null,
    };

    return responses.successResponse(
      { ...state },
      true,
      "public, s-maxage=600, max-age=840, stale-while-revalidate=600, stale-if-error=600"
    );
  } catch (error) {
    console.error(error);
    return responses.internalServerErrorResponse(`Unable to complete response: ${error.message}`, true);
  }
}
