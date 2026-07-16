"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SettingsTabs({
  defaultTab,
  pendingPrivacyCount,
  unacknowledgedConductCount,
  passwordContent,
  privacyContent,
  conductContent,
}: {
  defaultTab: string;
  pendingPrivacyCount: number;
  unacknowledgedConductCount: number;
  passwordContent: ReactNode;
  privacyContent: ReactNode;
  conductContent: ReactNode | null;
}) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="password">Change Password</TabsTrigger>
        <TabsTrigger value="privacy" className="gap-1.5">
          Privacy Control
          {pendingPrivacyCount > 0 && (
            <Badge variant="warning" className="px-1.5 py-0">
              {pendingPrivacyCount}
            </Badge>
          )}
        </TabsTrigger>
        {conductContent && (
          <TabsTrigger value="conduct" className="gap-1.5">
            Conduct
            {unacknowledgedConductCount > 0 && (
              <Badge variant="danger" className="px-1.5 py-0">
                {unacknowledgedConductCount}
              </Badge>
            )}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="password">{passwordContent}</TabsContent>
      <TabsContent value="privacy">{privacyContent}</TabsContent>
      {conductContent && <TabsContent value="conduct">{conductContent}</TabsContent>}
    </Tabs>
  );
}
