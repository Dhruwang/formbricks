"use client";

import { createOrganizationAction } from "@/app/setup/organization/create/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { z } from "zod";

import { ZOrganization } from "@formbricks/types/organizations";
import { Button } from "@formbricks/ui/Button";
import { FormControl, FormError, FormField, FormItem, FormProvider } from "@formbricks/ui/Form";
import { Input } from "@formbricks/ui/Input";

const ZCreateFirstOrganizationFormSchema = ZOrganization.pick({ name: true });
type TCreateFirstOrganizationForm = z.infer<typeof ZCreateFirstOrganizationFormSchema>;

export const CreateFirstOrganization = () => {
  const router = useRouter();

  const form = useForm<TCreateFirstOrganizationForm>({
    defaultValues: {
      name: "",
    },
    mode: "onChange",
    resolver: zodResolver(ZCreateFirstOrganizationFormSchema),
  });

  const { isSubmitting } = form.formState;
  const organizationName = form.watch("name");

  const onSubmit: SubmitHandler<TCreateFirstOrganizationForm> = async (data) => {
    try {
      const organizationName = data.name.trim();
      await createOrganizationAction(organizationName);
      router.push("/setup/member/invite");
    } catch (error) {
      toast.error("Some error occurred while creating organization");
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col items-center space-y-4">
          <h2 className="text-2xl font-medium">Setup your organization</h2>
          <p>Make it yours.</p>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    {...field}
                    isInvalid={!!form.formState.errors.name}
                    placeholder="e.g., Acme Inc"
                    className="w-80"
                    required
                  />
                </FormControl>

                <FormError />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            variant="darkCTA"
            className="flex w-80 justify-center"
            loading={isSubmitting}
            disabled={isSubmitting || organizationName.trim() === ""}>
            Continue
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};