import { Hono } from "hono";
import type { Scheduler } from "../scheduler.ts";

const schedules = new Hono();

// Scheduler instance will be injected
const state = {
  scheduler: null as Scheduler | null,
};

export const setScheduler = (scheduler: Scheduler): void => {
  state.scheduler = scheduler;
};

// GET /api/schedules - Get all schedules
schedules.get("/", async (c) => {
  if (!state.scheduler) {
    return c.json({ error: "Scheduler not initialized" }, 500);
  }

  const scheduleList = await state.scheduler.getSchedules();
  return c.json(scheduleList);
});

// GET /api/schedules/:id - Get specific schedule
schedules.get("/:id", async (c) => {
  if (!state.scheduler) {
    return c.json({ error: "Scheduler not initialized" }, 500);
  }

  const id = c.req.param("id");
  const schedule = await state.scheduler.getSchedule(id);

  if (!schedule) {
    return c.json({ error: "Schedule not found" }, 404);
  }

  return c.json(schedule);
});

// POST /api/schedules - Create new schedule
schedules.post("/", async (c) => {
  if (!state.scheduler) {
    return c.json({ error: "Scheduler not initialized" }, 500);
  }

  try {
    const body = await c.req.json();
    
    // Validate required fields
    if (!body.name || !body.command || !body.configPath || !body.cronExpression) {
      return c.json({ 
        error: "Missing required fields: name, command, configPath, cronExpression" 
      }, 400);
    }

    const schedule = await state.scheduler.createSchedule({
      name: body.name,
      command: body.command,
      configPath: body.configPath,
      cronExpression: body.cronExpression,
      args: body.args || [],
      enabled: body.enabled ?? true,
    });

    return c.json(schedule, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

// PUT /api/schedules/:id - Update schedule
schedules.put("/:id", async (c) => {
  if (!state.scheduler) {
    return c.json({ error: "Scheduler not initialized" }, 500);
  }

  const id = c.req.param("id");

  try {
    const body = await c.req.json();
    const schedule = await state.scheduler.updateSchedule(id, body);
    return c.json(schedule);
  } catch (error) {
    const errorMessage = String(error);
    if (errorMessage.includes("not found")) {
      return c.json({ error: errorMessage }, 404);
    }
    return c.json({ error: errorMessage }, 400);
  }
});

// DELETE /api/schedules/:id - Delete schedule
schedules.delete("/:id", async (c) => {
  if (!state.scheduler) {
    return c.json({ error: "Scheduler not initialized" }, 500);
  }

  const id = c.req.param("id");

  try {
    await state.scheduler.deleteSchedule(id);
    return c.json({ success: true });
  } catch (error) {
    const errorMessage = String(error);
    if (errorMessage.includes("not found")) {
      return c.json({ error: errorMessage }, 404);
    }
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/schedules/:id/toggle - Toggle schedule enabled/disabled
schedules.post("/:id/toggle", async (c) => {
  if (!state.scheduler) {
    return c.json({ error: "Scheduler not initialized" }, 500);
  }

  const id = c.req.param("id");

  try {
    const schedule = await state.scheduler.getSchedule(id);
    if (!schedule) {
      return c.json({ error: "Schedule not found" }, 404);
    }

    const updated = await state.scheduler.updateSchedule(id, {
      enabled: !schedule.enabled,
    });

    return c.json(updated);
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

// GET /api/schedules/next-runs - Get next run times for all schedules
schedules.get("/next-runs", (c) => {
  if (!state.scheduler) {
    return c.json({ error: "Scheduler not initialized" }, 500);
  }

  const nextRuns = state.scheduler.getNextRuns();
  const result: Record<string, string | null> = {};

  for (const [id, date] of nextRuns) {
    result[id] = date?.toISOString() || null;
  }

  return c.json(result);
});

export { schedules as schedulesRoutes };
