# Agentic AI App Hackathon Template

Welcome! This repository is your starting point for the **Agentic AI App Hackathon**. It includes:

- A consistent folder structure  
- An environment spec (`environment.yml` or `Dockerfile`)  
- Documentation placeholders to explain your design and demo

## 📋 Submission Checklist

- [ ] All code in `src/` runs without errors  
- [ ] `ARCHITECTURE.md` contains a clear diagram sketch and explanation  
- [ ] `EXPLANATION.md` covers planning, tool use, memory, and limitations  
- [ ] `DEMO.md` links to a 3–5 min video with timestamped highlights  


## 🚀 Getting Started

1. **Clone / Fork** this template.  Very Important. Fork Name MUST be the same name as the teamn name


## 📂 Folder Layout

![Folder Layout Diagram](images/folder-githb.png)



## 🏅 Judging Criteria

- **Technical Excellence **  
  This criterion evaluates the robustness, functionality, and overall quality of the technical implementation. Judges will assess the code's efficiency, the absence of critical bugs, and the successful execution of the project's core features.

- **Solution Architecture & Documentation **  
  This focuses on the clarity, maintainability, and thoughtful design of the project's architecture. This includes assessing the organization and readability of the codebase, as well as the comprehensiveness and conciseness of documentation (e.g., GitHub README, inline comments) that enables others to understand and potentially reproduce or extend the solution.

- **Innovative Gemini Integration **  
  This criterion specifically assesses how effectively and creatively the Google Gemini API has been incorporated into the solution. Judges will look for novel applications, efficient use of Gemini's capabilities, and the impact it has on the project's functionality or user experience. You are welcome to use additional Google products.

- **Societal Impact & Novelty **  
  This evaluates the project's potential to address a meaningful problem, contribute positively to society, or offer a genuinely innovative and unique solution. Judges will consider the originality of the idea, its potential real‑world applicability, and its ability to solve a challenge in a new or impactful way.

# HealthSymptom to CarePlan AI

An interactive agent that takes plain-language symptoms (e.g., “I’ve had a headache and fatigue for 3 days”) and:
- Analyzes and clarifies symptoms
- Plans a care strategy (triage, monitor, escalate, lifestyle)
- Uses Gemini API for reasoning and medical explanation
- Stores and retrieves memory (e.g., past symptoms, conditions)

## Setup

1. **Clone the repo**
2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Get a Gemini API key:**
   - Sign up at [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Copy your API key
4. **Create a `.env` file in the project root:**
   ```env
   GEMINI_API_KEY=your-gemini-api-key-here
   ```
5. **Run the app:**
   ```bash
   python src/main.py
   ```

## File Structure
- `src/gemini_client.py` — Gemini API client
- `src/planner.py` — Breaks down user goals into subtasks
- `src/executor.py` — Calls Gemini for each subtask
- `src/memory.py` — Logs and retrieves symptom history
- `src/main.py` — Main app loop

## Notes
- Your API key is required and should **never** be committed to version control.
- All memory is stored in `src/data/memory.json`.


