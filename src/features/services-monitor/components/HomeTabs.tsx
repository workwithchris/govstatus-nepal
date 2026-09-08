"use client";

import { LayoutDashboard, ChartColumnBig } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsView } from "@/features/services-monitor/components/analytics/AnalyticsView";
import { CategoryFilters } from "@/features/services-monitor/components/CategoryFilters";
import { MetricsOverview } from "@/features/services-monitor/components/MetricsOverview";
import { SearchAndSortBar } from "@/features/services-monitor/components/SearchAndSortBar";
import { ServicesView } from "@/features/services-monitor/components/ServicesView";

export function HomeTabs() {
  return (
    <Tabs defaultValue="dashboard" className="gap-8">
      <TabsList>
        <TabsTrigger value="dashboard">
          <LayoutDashboard className="size-4" />
          Dashboard
        </TabsTrigger>
        <TabsTrigger value="analytics">
          <ChartColumnBig className="size-4" />
          Analytics
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="space-y-10">
        <MetricsOverview />
        <div className="space-y-4">
          <SearchAndSortBar />
          <CategoryFilters />
        </div>
        <ServicesView />
      </TabsContent>

      <TabsContent value="analytics">
        <AnalyticsView />
      </TabsContent>
    </Tabs>
  );
}
