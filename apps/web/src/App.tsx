import {
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import "./app.css";

const sections = [
  {
    title: "Intake",
    description: "Capture recyclable materials and award points with floor rounding.",
  },
  {
    title: "Sales",
    description: "Redeem points against shop inventory with balance protection.",
  },
  {
    title: "Sync",
    description: "Queue events offline and push/pull with cursor-based sync.",
  },
];

export const App = (): JSX.Element => (
  <AppShell
    header={{
      height: 68,
    }}
    padding="md"
  >
    <AppShell.Header className="topBar">
      <Group justify="space-between" px="md" h="100%">
        <Group gap="sm">
          <Text fw={700} size="lg">
            Recycling Swap-Shop
          </Text>
          <Badge color="green">Phase 2 Spine</Badge>
        </Group>
        <Button variant="light" size="xs">
          Sync Now
        </Button>
      </Group>
    </AppShell.Header>
    <AppShell.Main className="mainSurface">
      <Container size="lg">
        <Stack gap="xl" py="xl">
          <div>
            <Title order={2}>Offline-First Operations</Title>
            <Text c="dimmed">
              Mobile-first shell for collectors, shop operators, and managers. This is the initial
              vertical slice.
            </Text>
          </div>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {sections.map((section) => (
              <Card
                className="sectionCard"
                key={section.title}
                shadow="sm"
                radius="md"
                padding="lg"
              >
                <Stack gap="sm">
                  <Title order={4}>{section.title}</Title>
                  <Text size="sm" c="dimmed">
                    {section.description}
                  </Text>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>
    </AppShell.Main>
  </AppShell>
);
