import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { createClient } from "@/utils/supabase/server";
import { GenerateForm } from "./generate-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadedFilesList } from "./uploaded-files-list";
import { ContentSubmission } from "./content-submission";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { UploadFormWrapper } from "./upload-form-wrappper";
import { ChatInterface } from "./chat-interface";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const metadata: Metadata = {
  robots: "noindex, nofollow",
};

export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, onboarding_at, stripe_is_subscribed")
    .single();

  if (!data?.onboarding_at) {
    redirect("/onboarding");
  }

  const { data: apiKeys } = await supabase.from("api_keys").select("*");
  const { data: uploadedFiles } = await supabase
    .from("files")
    .select("*")
    .match({ team_id: apiKeys?.[0]?.team_id })
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const { data: teamMemberships } = await supabase
    .from("team_memberships")
    .select("id, teams(name, id)");

  // Fetch API usage for the current month
  const { count: apiUsageCount } = await supabase
    .from("api_usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", data?.id)
    .gte(
      "created_at",
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    );

  const hasProSubscription = data?.stripe_is_subscribed ?? false;

  // Set API call limits based on subscription status
  const apiCallLimit = hasProSubscription ? 1000 : 100;
  const apiCallUsage = apiUsageCount || 0;
  const apiCallPercentage = Math.min(100, (apiCallUsage / apiCallLimit) * 100);

  // Calculate storage usage (placeholder for now)
  const storageLimit = hasProSubscription ? 10 * 1024 : 1024; // MB
  const storageUsage = 0; // This would need to be calculated from actual file sizes
  const storagePercentage = Math.min(100, (storageUsage / storageLimit) * 100);

  return (
    <SidebarProvider>
      <AppSidebar
        user={data}
        team={teamMemberships}
        hasProSubscription={hasProSubscription}
      />
      <SidebarInset>
        <header className="border-b flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto mr-4">
            {!hasProSubscription && (
              <Button asChild>
                <Link href="/pricing">Upgrade</Link>
              </Button>
            )}
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="rounded-xl p-4">
            <h2 className="text-2xl font-bold mb-4">Welcome to Supavec Beta</h2>
            <p>Generate your API key to get started with Supavec.</p>
          </div>
          <div className="min-h-[100vh] flex-1 rounded-xl md:min-h-min p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="p-4 rounded-xl border basis-full md:basis-1/2 bg-muted/10">
                <h3 className="text-xl font-semibold mb-4">
                  API Key Generation
                </h3>
                <p>Your API key will appear here once generated.</p>
                {Array.isArray(apiKeys) && apiKeys?.length > 0 ? (
                  <span className="p-1 text-sm bg-muted-foreground/20 rounded-md">
                    {apiKeys[0].api_key}
                  </span>
                ) : (
                  <GenerateForm />
                )}
              </div>

              <Card className="basis-full md:basis-1/2">
                <CardHeader>
                  <CardTitle>Usage</CardTitle>
                  <CardDescription>
                    Your current usage and limits
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">
                        AI Generations
                      </div>
                      <div className="font-medium">
                        {apiCallUsage} / {apiCallLimit}
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${apiCallPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">
                        Storage
                      </div>
                      <div className="font-medium">
                        {storageUsage} MB /{" "}
                        {hasProSubscription ? "10 GB" : "1 GB"}
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${storagePercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            {Array.isArray(apiKeys) && apiKeys?.length > 0 && (
              <div className="flex gap-4 flex-col">
                <h3 className="text-xl font-semibold mb-4 mt-8">Playground</h3>
                <div className="min-h-[50vh] flex-1 rounded-xl bg-muted/50 md:min-h-min p-4 border">
                  <Tabs defaultValue="upload" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="upload">Upload files</TabsTrigger>
                      <TabsTrigger value="content">Submit Content</TabsTrigger>
                    </TabsList>
                    <TabsContent value="upload" className="space-y-4">
                      <div className="mt-6">
                        <h4 className="text-lg font-semibold mb-4">
                          File Upload
                        </h4>
                        <p className="mb-4">
                          Upload PDF files to generate embeddings.
                        </p>
                        <UploadFormWrapper apiKey={apiKeys[0].api_key!} />
                        <UploadedFilesList
                          files={uploadedFiles}
                          apiKey={apiKeys[0].api_key!}
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="content">
                      <ContentSubmission apiKey={apiKeys[0].api_key!} />
                    </TabsContent>
                  </Tabs>
                </div>
                <div className="min-h-[50vh] flex-1 rounded-xl bg-muted/50 md:min-h-min p-4 border">
                  <ChatInterface
                    uploadedFiles={uploadedFiles}
                    apiKey={apiKeys[0].api_key!}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
