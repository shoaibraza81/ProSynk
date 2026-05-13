import { supabase } from "./supabaseClient";

export const calculateProjectProgress = async (projectId) => {
  try {
    // Get all tasks of this project
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId);

    if (error) {
      console.error("Error fetching tasks:", error);
      return;
    }

    if (!tasks || tasks.length === 0) {
      // No tasks = 0% progress
      await supabase
        .from("projects")
        .update({ progress: 0 })
        .eq("id", projectId);

      return;
    }

    let totalProgress = 0;

    tasks.forEach((task) => {
      switch (task.status) {
        case "To Do":
          totalProgress += 0;
          break;

        case "In Progress":
          totalProgress += 50;
          break;

        case "Review":
          totalProgress += 80;
          break;

        case "Done":
          totalProgress += 100;
          break;

        default:
          totalProgress += 0;
      }
    });

    // Final average %
    const finalProgress = Math.round(
      totalProgress / tasks.length
    );

    // Update project progress
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        progress: finalProgress,
      })
      .eq("id", projectId);

    if (updateError) {
      console.error("Error updating project progress:", updateError);
    }

  } catch (err) {
    console.error("Progress calculation error:", err);
  }
};