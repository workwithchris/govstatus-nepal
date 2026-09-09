"use client";

import { LayoutDashboard, ChartColumnBig, ScrollText } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsView } from "@/features/services-monitor/components/analytics/AnalyticsView";
import { CategoryFilters } from "@/features/services-monitor/components/CategoryFilters";
import { IncidentsView } from "@/features/services-monitor/components/IncidentsView";
import { MetricsOverview } from "@/features/services-monitor/components/MetricsOverview";
import { SearchAndSortBar } from "@/features/services-monitor/components/SearchAndSortBar";
import { ServicesView } from "@/features/services-monitor/components/ServicesView";
import { SimulatedDataNotice } from "@/features/services-monitor/components/SimulatedDataNotice";
import { useLang } from "@/lib/i18n";

export function HomeTabs() {
  const { t } = useLang();
  return (
    <Tabs defaultValue="dashboard" className="gap-8">
      <TabsList>
        <TabsTrigger value="dashboard">
          <LayoutDashboard className="size-4" />
          {t("tab.dashboard")}
        </TabsTrigger>
        <TabsTrigger value="analytics">
          <ChartColumnBig className="size-4" />
          {t("tab.analytics")}
        </TabsTrigger>
        <TabsTrigger value="incidents">
          <ScrollText className="size-4" />
          {t("tab.incidents")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="space-y-10">
        <SimulatedDataNotice />
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

      <TabsContent value="incidents">
        <IncidentsView />
      </TabsContent>
    </Tabs>
  );
}
