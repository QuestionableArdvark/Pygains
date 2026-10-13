// app.js
// Re-implements your Python project's logic in-browser using localStorage persistence.
// Keys: profile, finance_entries (array), workouts (array)

const STORAGE_KEY = "tracker_db_v1";

function todayIso(offsetDays = 0) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Default DB shape
function defaultDb() {
  return {
    profile: null,
    finance_entries: [], // {date, entry_type, category, amount}
    workouts: [] // {date, exercise, planned_reps, completed_reps, calories_burned}
  };
}

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDb();
    return JSON.parse(raw);
  } catch (e) {
    console.error("DB load error:", e);
    return defaultDb();
  }
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function appendLog(msg) {
  const log = document.getElementById("log");
  const time = new Date().toLocaleTimeString();
  log.textContent = `[${time}] ${msg}\n\n` + log.textContent;
}

// Finance functions (port of finance.py)
function add_income(category, amount) {
  const db = loadDb();
  db.finance_entries.push({date: todayIso(), entry_type: "income", category, amount: Number(amount)});
  saveDb(db);
}

function add_expense(category, amount) {
  const db = loadDb();
  db.finance_entries.push({date: todayIso(), entry_type: "expense", category, amount: Number(amount)});
  saveDb(db);
}

function monthly_summary(year, month) {
  const db = loadDb();
  const prefix = `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}`;
  const rows = db.finance_entries.filter(r => r.date.startsWith(prefix));
  const total_income = rows.filter(r => r.entry_type === "income").reduce((s,r)=>s + Number(r.amount), 0);
  const total_expense = rows.filter(r => r.entry_type === "expense").reduce((s,r)=>s + Number(r.amount), 0);
  return {
    income: total_income,
    expense: total_expense,
    net: total_income - total_expense,
    entries: rows
  };
}

// Fitness functions (port of fitness.py)
const CALORIES_PER_REP_AT_70KG = {
  "Push-ups": 0.30, "Squats": 0.32, "Pull-ups": 1.00, "Burpees": 0.50,
  "Lunges": 0.30, "Bench Press": 0.40, "Bicep Curls": 0.15, "Shoulder Press": 0.25,
  "Tricep Dips": 0.30, "Deadlifts": 0.50, "Leg Press": 0.40, "Calf Raises": 0.10
};
const CALORIES_PER_SECOND_PLANK_AT_70KG = 0.05;

const PRESETS = {
  "Calisthenics - Beginner": {"Push-ups": 15, "Squats": 20, "Lunges": 10, "Plank (seconds)": 30},
  "Calisthenics - Intermediate": {"Push-ups": 25, "Pull-ups": 8, "Squats": 30, "Burpees": 15},
  "Bodybuilding - Upper Body": {"Bench Press": 10, "Bicep Curls": 12, "Shoulder Press": 10, "Tricep Dips": 12},
  "Bodybuilding - Lower Body": {"Squats": 12, "Deadlifts": 10, "Leg Press": 12, "Calf Raises": 15}
};

function calculate_bmr(weight_kg, height_cm, age, gender) {
  if ((gender || "").toLowerCase().startsWith("m")) return 10*weight_kg + 6.25*height_cm - 5*age + 5;
  return 10*weight_kg + 6.25*height_cm - 5*age - 161;
}

function estimate_calories(exercise, reps, weight_kg) {
  let per_unit = (exercise === "Plank (seconds)") ? CALORIES_PER_SECOND_PLANK_AT_70KG : (CALORIES_PER_REP_AT_70KG[exercise] ?? 0.25);
  return Math.round(per_unit * reps * (weight_kg / 70) * 10) / 10;
}

function get_last_deficit(exercise) {
  const db = loadDb();
  const list = db.workouts.filter(w => w.exercise === exercise);
  if (!list.length) return 0;
  const last = list[list.length - 1]; // last appended is latest (we append by date order)
  const deficit = Number(last.planned_reps) - Number(last.completed_reps);
  return deficit > 0 ? deficit : 0;
}

function log_workout(exercise, planned_reps, completed_reps, weight_kg) {
  const calories = estimate_calories(exercise, completed_reps, weight_kg);
  const db = loadDb();
  db.workouts.push({
    date: todayIso(),
    exercise,
    planned_reps: Number(planned_reps),
    completed_reps: Number(completed_reps),
    calories_burned: Number(calories)
  });
  saveDb(db);
  const fully_met = Number(completed_reps) >= Number(planned_reps);
  return {calories, fully_met};
}

// UI handlers that mirror the CLI behavior
function setup_profile_ui() {
  const db = loadDb();
  const name = prompt("Enter your name:", db.profile?.name ?? "");
  if (name === null) return;
  const age = Number(prompt("Enter your age:", db.profile?.age ?? ""));
  if (isNaN(age)) { alert("Invalid age"); return; }
  const weight_kg = Number(prompt("Enter your weight (kg):", db.profile?.weight_kg ?? ""));
  if (isNaN(weight_kg)) { alert("Invalid weight"); return; }
  const height_cm = Number(prompt("Enter your height (cm):", db.profile?.height_cm ?? ""));
  if (isNaN(height_cm)) { alert("Invalid height"); return; }
  const gender = prompt("Enter your gender (M/F):", db.profile?.gender ?? "");
  db.profile = {name, age, weight_kg, height_cm, gender};
  saveDb(db);
  appendLog("Profile saved.");
}

function log_salary_ui() {
  const amount = Number(prompt("Enter salary amount:"));
  if (isNaN(amount)) { alert("Invalid amount"); return; }
  add_income("Salary", amount);
  appendLog(`Salary logged: ${amount.toFixed(2)}`);
}

function log_utility_ui() {
  const name = prompt("Utility name (e.g. Electricity):", "Electricity");
  if (name === null) return;
  const amount = Number(prompt("Amount:"));
  if (isNaN(amount)) { alert("Invalid amount"); return; }
  add_expense(`Utility - ${name}`, amount);
  appendLog(`Utility expense logged: ${name} ${amount.toFixed(2)}`);
}

function view_finance_summary_ui() {
  const now = new Date();
  const summary = monthly_summary(now.getFullYear(), now.getMonth() + 1);
  let text = `===== FINANCE SUMMARY (${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}) =====\n`;
  text += `Total Income  : ${summary.income.toFixed(2)}\n`;
  text += `Total Expense : ${summary.expense.toFixed(2)}\n`;
  text += `Net           : ${summary.net.toFixed(2)}\n\n`;
  text += "Entries:\n";
  if (summary.entries.length === 0) text += "  (no entries)\n";
  else summary.entries.forEach(e => text += `  ${e.date} ${e.entry_type} ${e.category} ${Number(e.amount).toFixed(2)}\n`);
  appendLog(text);
}

function log_single_exercise_ui() {
  const db = loadDb();
  if (!db.profile) { appendLog("Please set up your profile first (menu option 1)."); return; }
  const weight_kg = Number(db.profile.weight_kg);
  let exercise = prompt("Exercise name (match preset names or enter new):", "Push-ups");
  if (exercise === null) return;
  let planned = Number(prompt("Planned reps (or seconds for planks):", "10"));
  if (isNaN(planned)) { alert("Invalid planned"); return; }

  const deficit = get_last_deficit(exercise);
  if (deficit > 0) {
    if (confirm(`Note: last session was short by ${deficit} — add to today's target?`)) planned += deficit;
  }

  const completed = Number(prompt(`Completed (target is now ${planned}):`, String(planned)));
  if (isNaN(completed)) { alert("Invalid completed"); return; }

  const res = log_workout(exercise, planned, completed, weight_kg);
  appendLog(`Logged ${exercise}. Estimated calories burned: ${res.calories}. ${res.fully_met ? "Target met!" : `Short by ${planned - completed}`}`);
}

function log_preset_routine_ui() {
  const db = loadDb();
  if (!db.profile) { appendLog("Please set up your profile first (menu option 1)."); return; }
  const weight_kg = Number(db.profile.weight_kg);
  const names = Object.keys(PRESETS);
  let list = "Available presets:\n";
  names.forEach((n,i)=> list += `${i+1}. ${n}\n`);
  const choice = Number(prompt(list + "\nChoose a preset number:", "1"));
  if (isNaN(choice) || choice < 1 || choice > names.length) { alert("Invalid choice"); return; }
  const chosen = names[choice-1];
  appendLog(`\n--- ${chosen} ---`);
  const routine = PRESETS[chosen];
  for (const [exercise, basePlanned] of Object.entries(routine)) {
    const deficit = get_last_deficit(exercise);
    let target = basePlanned + (deficit > 0 ? deficit : 0);
    if (deficit > 0) appendLog(`(${exercise}: base target ${basePlanned}, +${deficit} carried over)`);
    const completed = Number(prompt(`${exercise} - target ${target}, completed:`, String(target)));
    if (isNaN(completed)) { alert("Invalid completed"); return; }
    const res = log_workout(exercise, target, completed, weight_kg);
    const status = res.fully_met ? "target met" : `short by ${target - completed}`;
    appendLog(`  -> ${exercise}: ${res.calories} kcal burned, ${status}`);
  }
}

// Export/Import DB
function exportDb() {
  const db = loadDb();
  const blob = new Blob([JSON.stringify(db, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tracker-db-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importDb() {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".json,application/json";
  inp.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target.result);
        if (!obj || typeof obj !== "object") throw new Error("Invalid JSON");
        saveDb(obj);
        appendLog("DB imported successfully.");
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(f);
  };
  inp.click();
}

// Hook up buttons
document.getElementById("btnProfile").addEventListener("click", setup_profile_ui);
document.getElementById("btnSalary").addEventListener("click", log_salary_ui);
document.getElementById("btnUtility").addEventListener("click", log_utility_ui);
document.getElementById("btnSummary").addEventListener("click", view_finance_summary_ui);
document.getElementById("btnSingle").addEventListener("click", log_single_exercise_ui);
document.getElementById("btnPreset").addEventListener("click", log_preset_routine_ui);
document.getElementById("btnExport").addEventListener("click", exportDb);
document.getElementById("btnImport").addEventListener("click", importDb);

// welcome message
appendLog("Tracker ready. Use the buttons above to run actions.");
