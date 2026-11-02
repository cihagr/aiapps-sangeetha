import axios from "axios";

// New agentic workflow endpoints
const GET_AGENT_CONFIG_URL = import.meta.env.VITE_GET_AGENT_CONFIG_URL;
const AGENTIC_ITEM_GEN_URL = import.meta.env.VITE_AGENTIC_ITEM_GEN_URL;

// Removed old initiateItemGeneration and legacy ITEM_GEN_API_URL flow
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Brain, Check, Target, Shield, Cpu, Database, Image as ImageIcon, Info } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { sendStep1API, sendStep2API, sendStep3API } from "@/api";
import { API_ENDPOINTS } from "@/config";
import { generateImagesForGeneratedQuestions } from "@/utils/questionImageGeneration"
const AIGQuestionGenerationLoading = () => {
  const navigate = useNavigate()
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const selectedoption = sessionStorage.getItem("selectedGenerationMode");

  // Removed unused agent status states

  // Dynamic steps derived from get-agent-config
  const [steps, setSteps] = useState<Array<{ title: string; subtitle: string }>>([])
  // Track per-step status to support parallel processing
  const [stepStatuses, setStepStatuses] = useState<Record<number, "pending" | "processing" | "complete">>({})
  const [generatedQuestionSource, setGeneratedquestionSource] = useState<string>("")
  const isSSO = sessionStorage.getItem('isSSO') === 'true';
  const features = [
    {
      icon: <Brain className="w-6 h-6" />,
      title: "Neural Analysis",
      subtitle: "Advanced NLP processing",
      bgColor: "from-blue-500 to-blue-600"
    },
    {
      icon: <Cpu className="w-6 h-6" />,
      title: "AI Processing",
      subtitle: "Real-time generation",
      bgColor: "from-purple-500 to-purple-600"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Quality Assurance",
      subtitle: "Accuracy validation",
      bgColor: "from-green-500 to-green-600"
    },
    {
      icon: <Database className="w-6 h-6" />,
      title: "Data Processing",
      subtitle: "Content optimization",
      bgColor: "from-orange-500 to-orange-600"
    }
  ]

  useEffect(() => {
    // Helper: safe get from session
    const getSession = (key: string, fallback: any = "") => {
      const v = sessionStorage.getItem(key)
      return v !== null && v !== undefined && v !== "undefined" ? v : fallback
    }

    const deriveQuestionType = () => {
      const raw = (getSession("selectedQuestionType", "") as string) || ""
      const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      if (!normalized) return { questiontypename: raw || "Multiple choice", question_type: "MULTIPLE_CHOICE" }
      const tokens = new Set(normalized.split(/\s+/))

      // Select the Blank (check BEFORE generic blank check)
      if (tokens.has('select') && tokens.has('blank')) {
        return { questiontypename: raw || "Select the Blank", question_type: "SELECT_THE_BLANK" }
      }

      // True/False (detect both tokens present or common variants)
      if ((tokens.has('true') && tokens.has('false')) || normalized.includes('true/false') || normalized.includes('true false')) {
        return { questiontypename: raw || "True/False", question_type: "TRUE_FALSE" }
      }

      // Multiple Response (explicit)
      if (tokens.has('multiple') && (tokens.has('response') || normalized.includes('multiple-response'))) {
        return { questiontypename: raw || "Multiple Response", question_type: "MULTIPLE_RESPONSE" }
      }

      // Matrix
      if (tokens.has('matrix')) {
        return { questiontypename: raw || "Matrix", question_type: "MATRIX" }
      }

      // Fill/Gaps (after Select the Blank check)
      if (tokens.has('fill') || tokens.has('gap') || tokens.has('blank')) {
        return { questiontypename: raw || "Fill in the Blank", question_type: "FILL_IN_THE_BLANK" }
      }

      // Written / Long / Essay
      if (tokens.has('written') || tokens.has('long') || tokens.has('essay') || normalized.includes('written response')) {
        return { questiontypename: raw || "Written response", question_type: "WRITTEN_RESPONSE" }
      }

      // Scenario Based
      if (tokens.has('scenario') || normalized.includes('scenario based')) {
        return { questiontypename: raw || "Scenario Based", question_type: "SCENARIO_BASED" }
      }

      // Multi Tab Passage
      if (tokens.has('multi') && tokens.has('tab') && tokens.has('passage') || normalized.includes('multi tab passage')) {
        return { questiontypename: raw || "Multi Tab Passage", question_type: "MULTI_TAB_PASSAGE" }
      }

      // Default to Multiple Choice when 'multiple' token present or as a fallback
      if (tokens.has('multiple')) {
        return { questiontypename: raw || "Multiple choice", question_type: "MULTIPLE_CHOICE" }
      }

      return { questiontypename: raw || "Multiple choice", question_type: "MULTIPLE_CHOICE" }
    }

    const startAgenticWorkflow = async () => {
      try {
        // Build config payload from session
        let userInfo: any = {}
        try { userInfo = JSON.parse(getSession("userInfo", "{}") as string) || {} } catch { }

        const isSSOType3 = sessionStorage.getItem("isSSO") === "true" && sessionStorage.getItem("loginType") === "3";
        const configPayload = {
          custcode: getSession("custcode", userInfo.custCode || ""),
          orgcode: getSession("orgcode", userInfo.orgCode || ""),
          appcode: getSession("appcode", "AIG"),
          sourcename: isSSOType3 ? (sessionStorage.getItem("bookname") || "") : (sessionStorage.getItem("bookTitle") || "").replace(/\s+/g, '_')
        }

        // Fetch dynamic agent configuration
        const cfgResp = await axios.post(GET_AGENT_CONFIG_URL, configPayload)
        // The Assessment agent is called "Review agent" now: renamed here, where the
        // list arrives, so the progress steps and the agentic_item_gen payload both
        // use the new name.
        const configAgents: Array<{ agentname: string; agentstatus: string | number; sourcename?: string }> =
          (((cfgResp.data && cfgResp.data.results) || []) as Array<{ agentname: string; agentstatus: string | number; sourcename?: string }>)
            .map((a) => (
              String(a?.agentname || "").trim().toLowerCase() === "assessment"
                ? { ...a, agentname: "Review agent" }
                : a
            ))

        // Use default agent when config returns none so agentic_item_gen is still called
        let activeAgents: Array<{ agentname: string; agentstatus: string | number; sourcename?: string }> = configAgents
        const isSSO = sessionStorage.getItem("isSSO") === "true"

        // Removes the Retrieval agent if toogles to LLM
        const isLLMMode =
          String(selectedoption).toUpperCase() === "LLM" ||
          String(getSession("selectedGenerationMode", "")).toUpperCase() === "LLM";

        if (isLLMMode && activeAgents.length > 0) {
          // Remove first agent and renumber remaining agentstatus to 1..N
          activeAgents = activeAgents
            .slice(1)
            .map((a, idx) => ({
              ...a,
              agentstatus: String(idx + 1),
            }));

          // Safety fallback: if removing the first agent leaves none, run Review agent
          if (!activeAgents.length) {
            activeAgents = [{ agentname: "Review agent", agentstatus: "1" }];
          }
        }


        // if (!activeAgents.length) {
        //   if (isSSO) {
        //     activeAgents = [
        //       { agentname: "Retrieval", agentstatus: "1" },
        //       { agentname: "Review agent", agentstatus: "2" },
        //     ]
        //   } else {
        //     console.warn("No agents returned by get-agent-config; using default agent.")
        //     activeAgents = [{ agentname: "Review agent", agentstatus: "2" }]
        //   }
        // }
        if (!activeAgents.length) {
          if (isSSO) {
            if (selectedoption === "LLM") {
              activeAgents = [
                { agentname: "Review agent", agentstatus: "1" }
              ];
            } else {
              activeAgents = [
                { agentname: "Retrieval", agentstatus: "1" },
                { agentname: "Review agent", agentstatus: "2" }
              ];
            }
          } else {
            console.warn("No agents returned by get-agent-config; using default agent.");
            activeAgents = [{ agentname: "Review agent", agentstatus: "2" }];
          }
        }

        // Initialize dynamic steps and statuses
        setSteps(
          activeAgents.map((a, idx) => ({
            title: a.agentname || `Agent ${idx + 1}`,
            subtitle: `Agent ${a.agentstatus}`
          }))
        )

        const initialStatuses: Record<number, "pending" | "processing" | "complete"> = {}
        activeAgents.forEach((_, i) => { initialStatuses[i] = "pending" })
        setStepStatuses(initialStatuses)
        setProgress(5)

        // Prepare common payload and build question prompt based on question type
        const { questiontypename, question_type } = deriveQuestionType()
        // Debug: log selection and derived mapping to troubleshoot incorrect defaults
        try {
          const rawSelected = getSession("selectedQuestionType", "")
          const normalizedDbg = (rawSelected as string).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
          console.debug('[AIG] selectedQuestionType raw:', rawSelected)
          console.debug('[AIG] selectedQuestionType normalized:', normalizedDbg)
          console.debug('[AIG] derived questiontypename/question_type:', questiontypename, question_type)
        } catch (e) {
          console.debug('[AIG] deriveQuestionType debug failed', e)
        }

        // Read session values used to construct the prompt
        const selectedOption = String(getSession("selectedGenerationMode"))
        const selectedNumberOfQuestions = Number(getSession("selectedNumberOfQuestions", getSession("selectedQuantity", getSession("noofquestions", "1")))) || 1
        const Snumber = String(getSession("Snumber", getSession("studyNumber", "")))
        const selectedChapterName = String(getSession("selectedChapterName", getSession("selectedChapter", "")))
        const LOs = String(getSession("LOs", getSession("learningObjectivesName", "")))
        const marks = String(getSession("marks", getSession("pointValue", "")))
        const selectedDistractor = Number(getSession("selectedResponseOptions"))
        const numberOfCorrectOptions = Number(getSession("numberOfCorrectOptions"))
        const additionalInstructionText = String(getSession("additionalInstructions", getSession("task_content", "")))
        const selectedTaxonomy = String(getSession("selectedTaxonomy", getSession("taxonomyname", "")))
        const Taxonomy = selectedTaxonomy

        // Determine raw selected question type string to select template
        const rawQType = String(getSession("selectedQuestionType", "")).toLowerCase()

        const passageModeForGen = String(getSession("passageMode", "single"))
        const numPassagesForGen = Number(getSession("numPassages", "2")) || 2
        const numTableColumnsForGen = Math.max(1, Math.min(3, Number(getSession("numTableColumns", "2")) || 2))
        const numTableRowsForGen = Math.max(1, Math.min(5, Number(getSession("numTableRows", "5")) || 5))

        // Helper to append multi-passage instructions and additional instructions
        const appendAdditional = (base: string) => {
          let result = base
          if (passageModeForGen === "multi") {
            if (numPassagesForGen >= 2) {
              result = result + `\n**Multi-Passage Requirement (MANDATORY):** Generate EXACTLY ${numPassagesForGen} passages, one per tab, as described in the Multi-Tab Comparative Passage guideline. The Tabs array in your output MUST contain exactly ${numPassagesForGen} entries — count them before returning. Do not default to 2 passages if a different number is specified here.`
            } else {
              result = result + `\n**Single-Passage Requirement (MANDATORY):** Generate exactly ONE self-contained scenario/passage, as described in the Scenario_based guideline. Do NOT use comparative language, do NOT reference "other passages," and do NOT require cross-passage comparison — there is only one passage. Still return it wrapped as a Tabs array with exactly ONE entry so it renders consistently with the passage tab UI: "Tabs": [{ "TabTitle": "<short descriptive title for this passage>", "Passage": "<the full, non-empty passage text>" }]. The Passage field must contain real, complete passage text — never leave it blank.`
            }
          } else if (passageModeForGen === "table") {
            result = result + `
**Table Analysis Requirement (MANDATORY):** Before writing the question, construct exactly ONE data table and output it as a "TableAnalysis" object, regardless of the question type being generated. Rules:
- First column is always "S.no" (sequential integers starting at 1).
- Include exactly ${numTableColumnsForGen} additional data column(s) beyond "S.no", with headers relevant to the Domain/Enabling Objective — do not force generic headers like Name/Score if the topic calls for something else.
- Include exactly ${numTableRowsForGen} data row(s) — never more.
- At least one data column must contain comparable values (numeric, date, or ordinal) so the question can involve averages, medians, counts, totals, min/max, or rank.
- Do not duplicate values within a column unless the duplication is deliberately the point of a statement.
- The table will be shown to the end user with independent per-column sorting. The question, correct answer, and every option/distractor must be verifiable strictly from column VALUES — never from row position or order (do not write or imply "the first row," "the entry listed last," etc.).
- Output structure: "TableAnalysis": { "Columns": ["S.no", ...], "Rows": [[1, ...], [2, ...]], "SortableColumns": [<data column headers, excluding "S.no">] }.
- Generate the table FIRST, then the question stem/PartPrompt (which must instruct the reader to use only the table), THEN the answer/options exactly per the active question type's normal schema — nothing about the options/answer format changes, only the table precedes them.
- This applies identically whether the active question type is Multiple Choice, Multiple Response, True/False, Fill In the Blank, Select the Blank, Written Response, or Matrix.`
          }
          if (additionalInstructionText && additionalInstructionText !== "" && additionalInstructionText !== "null") {
            result = result + `\nUser Instructions:\n${additionalInstructionText}\n**Important:** Make sure each question and its options follow the user instruction while generating. Please ensure that the generated question reflects the user instructions above. Incorporate all relevant details while adhering to the specified guidelines.`
          }
          return result
        }

        // Initialize response options from localStorage or set default
        const programname = getSession("programname")
        const isStudyLOEnabled = getSession("isStudyLOEnabled") !== "false";
        const isTaxonomyEnabled = getSession("isTaxonomyEnabled") !== "false";
        const isQuestionFormatEnabled = getSession("isQuestionFormatEnabled") !== "false";
        const isCreativityLevelEnabled = getSession("isCreativityLevelEnabled") !== "false";
        const isPointValueEnabled = getSession("isPointValueEnabled") !== "false";
        const isQuestionQuantityEnabled = getSession("isQuestionQuantityEnabled") !== "false";
        const isResponseOptionsEnabled = getSession("isResponseOptionsEnabled") !== "false";

        // Build the question prompt according to the requested type
        let question = getSession("aigQuestionPrompt", getSession("questionPrompt", ""))

        if (rawQType.includes("multiple response") || rawQType.includes("multiple-response")) {
          // Multiple Response
          const domainInfo = isStudyLOEnabled ? `based exclusively on the ${Snumber} Domain and Domain name is '${selectedChapterName}'.` : "";
          const loInfo = isStudyLOEnabled ? `Each question should align with the content of the study material and the corresponding Enabling Objective: ${LOs},but **do not repeat or closely mirror the exact wording** of the EO statement. \nInstead, the questions should assess the application and deeper understanding of the content related to that Enabling Objective.` : "Each question should assess the application and deeper understanding of the content.";
          const pointInfo = isPointValueEnabled ? `for marks ${marks}` : "";
          const optionInfo = isResponseOptionsEnabled ? `Options should be exactly ${selectedDistractor} Distractors., with exactly ${numberOfCorrectOptions} correct answers` : "Provide exactly 4 options per question, with exactly 2 correct answers";
          const distractorText = isResponseOptionsEnabled ? `Provide exactly ${selectedDistractor} options per question, labelled A to ${String.fromCharCode(64 + selectedDistractor)}.\nProvide exactly ${numberOfCorrectOptions} correct answers among the options` : "Provide exactly 4 options per question, labelled A to D.\nProvide exactly 2 correct answers among the options";

          if (selectedOption === 'LLM') {
            setGeneratedquestionSource('LLM');
            const promptContext = programname ? programname : domainInfo;
            question = `Generate exactly ${selectedNumberOfQuestions} Multiple Response questions ${promptContext} \n${loInfo}\n
            Important:\n${optionInfo} ${pointInfo}.\n${distractorText}`;
          } else {
            setGeneratedquestionSource('Book Based');
            question = `Generate exactly ${selectedNumberOfQuestions} Multiple Response questions ${domainInfo} \n${loInfo}\nImportant:\n${optionInfo} ${pointInfo}.\n${distractorText}`;
          }
          // leave special formatting separate from the shared additional instruction helper
          if (additionalInstructionText != '' && additionalInstructionText != null) {
            question = question + `\nImportant Format for sub-quesiton:\n1. IF the question consist of subquesiton then display it one after the other like this shown below:\n\n<Main question>.\n(a) <sub-question 1>.\n(b) <sub-question 2>.\n(c) <sub-question 3>.\n(d) <sub-question 4>`
          }
        } else if (rawQType.includes("true") || rawQType.includes("false")) {
          // True/False
          const domainInfo = isStudyLOEnabled ? `based exclusively on the ${Snumber} Domain and Domain name is '${selectedChapterName}'.` : "";
          const loInfo = isStudyLOEnabled ? `The questions should align with the content fo the study material and the corresponding Enabling Objective: ${LOs},but **do not repeat or closely mirror the exact wording** of the LO statement. \nInstead, the questions should assess the application and deeper understanding of the content related to that Enabling Objective.` : "The questions should assess the application and deeper understanding of the content.";
          const pointInfo = isPointValueEnabled ? `The marks is ${marks}` : "";

          if (selectedOption === 'LLM') {
            setGeneratedquestionSource('LLM');
            const promptContext = programname ? programname : domainInfo;
            question = `Generate exactly ${selectedNumberOfQuestions} True/False questions ${promptContext} \n${loInfo}\n${pointInfo}`;
          } else {
            setGeneratedquestionSource('Book Based');
            question = `Generate exactly ${selectedNumberOfQuestions} True/False questions ${domainInfo} \n${loInfo}\n${pointInfo}`;
          }
          if (additionalInstructionText != '' && additionalInstructionText != null) {
            question = question + `\nUser Instructions:\n${additionalInstructionText}\n**Important:** Make sure each question and its options follow the user instruction while generating. Please ensure that the generated question reflects the user instructions above. Incorporate all relevant details while adhering to the specified guidelines.`
          }
        } else if (rawQType.includes("fill") || rawQType.includes("gap")) {
          // Fill in the blank / Gap Fill (Dropdown-based)
          const domainInfo = isStudyLOEnabled ? `based exclusively on the ${Snumber} Domain and Domain name is "${selectedChapterName}".` : "";
          const loInfo = isStudyLOEnabled ? `The questions should align with the content of the study material and the corresponding Learning Objective: ${LOs}, but **do not repeat or closely mirror the exact wording** of the LO statement. \nInstead, the questions should assess the application and deeper understanding of the content related to that learning objective.` : "The questions should assess the application and deeper understanding of the content.";
          const pointInfo = isPointValueEnabled ? `The marks is ${marks}.` : "";
          // "Fill In the Blank Dropdown" uses an interactive [Dropdown1] placeholder;
          // the classic "Fill In the Blank" keeps its original [gap1] behaviour.
          const isDropdownVariant = rawQType.includes("dropdown");
          const gapInstruction = isDropdownVariant
            ? `IMPORTANT:\n Use [Dropdown1] as the placeholder for the interactive dropdown. Do NOT use blanks, underscores, or any other gap markers.`
            : `IMPORTANT:\n If other than the [gap1] is specified like '_____' or any other structure give in that structure only`;

          if (selectedOption === 'LLM') {
            setGeneratedquestionSource('LLM');
            const promptContext = programname ? programname : domainInfo;
            question = `Generate exactly ${selectedNumberOfQuestions} Gap Fill questions ${promptContext} \n${loInfo}\n${pointInfo}\n${gapInstruction}`;
          } else {
            setGeneratedquestionSource('Book Based');
            question = `Generate exactly ${selectedNumberOfQuestions} Gap Fill questions ${domainInfo} \n${loInfo}\n${pointInfo}\n${gapInstruction}`;
          }
          if (additionalInstructionText != '' && additionalInstructionText != null) {
            question = question + `\nUser Instructions:\n${additionalInstructionText}\n**Important:** Make sure each question and its options follow the user instruction while generating. Please ensure that the generated question reflects the user instructions above. Incorporate all relevant details while adhering to the specified guidelines.` + (isDropdownVariant
              ? `\nUse [Dropdown1] as the placeholder. Do NOT use blanks or underscores.`
              : `If other than the [gap1] is specified like '_____' or any other structure give in that structure only`)
          }
        } else if (rawQType.includes("matrix")) {
          // Matrix
          const domainInfo = isStudyLOEnabled ? `based exclusively on the ${Snumber} Study and study name is "${selectedChapterName}".` : "";
          const loInfo = isStudyLOEnabled ? `The questions should align with the content of the study material and the corresponding Learning Objective: ${LOs}, but **do not repeat or closely mirror the exact wording** of the LO statement. \nInstead, the questions should assess the application and deeper understanding of the content related to that learning objective.` : "The questions should assess the application and deeper understanding of the content.";
          const taxonomyInfo = isTaxonomyEnabled ? `The questions must adhere to the specified Taxonomy: "${Taxonomy}".` : "";
          const pointInfo = isPointValueEnabled ? `The marks is ${marks}.` : "";

          if (selectedOption === 'LLM') {
            setGeneratedquestionSource('LLM');
            const promptContext = programname ? programname : domainInfo;
            question = `\nGenerate exactly ${selectedNumberOfQuestions} matrix type question ${promptContext} ${loInfo} ${taxonomyInfo} Each question must reflect content strictly from the specified study material.\nImportant: \n1. Do not reuse or repeat the exact question label, but use the content and context of the previous question.              \n2. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary.\nThe number of questions should be exactly ${selectedNumberOfQuestions} ${isTaxonomyEnabled ? `with Taxonomy level ${Taxonomy}` : ""}\n${pointInfo}`;
            if (passageModeForGen === 'table') {
              question = question + `\n**Matrix-from-Table Requirement (MANDATORY):** After constructing the TableAnalysis reference table for this question, build the matrix answer grid directly from that table's data rows — do not invent separate matrix content.\n- Create exactly one matrix item per TableAnalysis data row (use the row's primary label/name column as the item text).\n- Choose exactly ONE data column from the table (other than "S.no") to serve as each item's correct matching value across all rows.\n- Every TableAnalysis data row MUST produce a corresponding matrix item — do not skip, merge, or omit any row, regardless of how many data rows or columns the table contains.\n- If two or more rows share the same value in the chosen matching column, still include a matrix item for each row individually (do not deduplicate rows).\n- Output the matrix item/value pairs using the schema already expected for Matrix questions (MatrixItems, MatrixResponses, MatrixCorrectPairs, plus rows/columns/CorrectAnswer as normally required) — do not change the existing output schema, only ensure it is fully and correctly populated for every table row.\n- Before returning, verify: number of matrix items === number of TableAnalysis data rows. If they do not match, regenerate the matrix section before returning the final answer.`;
            }
          } else {
            setGeneratedquestionSource('Book Based');
            question = `Generate exactly ${selectedNumberOfQuestions} matrix type questions ${domainInfo} ${loInfo} ${taxonomyInfo} Each question must reflect content strictly from the specified study material.\nImportant: \n1. Do not reuse or repeat the exact question label, but use the content and context of the previous question.              \n2. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary.\nThe number of questions should be exactly ${selectedNumberOfQuestions} ${isTaxonomyEnabled ? `with Taxonomy level ${selectedTaxonomy}` : ""}.\n\nImportant: \n${isTaxonomyEnabled ? `- TAXONOMY LEVEL TO USE: '${Taxonomy}'\n` : ""}- Do not provide any options in the output, directly provide the correct answer.\n${pointInfo}`;
            if (passageModeForGen === 'table') {
              question = question + `\n**Matrix-from-Table Requirement (MANDATORY):** After constructing the TableAnalysis reference table for this question, build the matrix answer grid directly from that table's data rows — do not invent separate matrix content.\n- Create exactly one matrix item per TableAnalysis data row (use the row's primary label/name column as the item text).\n- Choose exactly ONE data column from the table (other than "S.no") to serve as each item's correct matching value across all rows.\n- Every TableAnalysis data row MUST produce a corresponding matrix item — do not skip, merge, or omit any row, regardless of how many data rows or columns the table contains.\n- If two or more rows share the same value in the chosen matching column, still include a matrix item for each row individually (do not deduplicate rows).\n- Output the matrix item/value pairs using the schema already expected for Matrix questions (MatrixItems, MatrixResponses, MatrixCorrectPairs, plus rows/columns/CorrectAnswer as normally required) — do not change the existing output schema, only ensure it is fully and correctly populated for every table row.\n- Before returning, verify: number of matrix items === number of TableAnalysis data rows. If they do not match, regenerate the matrix section before returning the final answer.`;
            }
          }
          if (additionalInstructionText != '' && additionalInstructionText != null) {
            question = question + `\nUser Instructions:\n${additionalInstructionText}\n**Important:** Make sure each question and its options follow the user instruction while generating. Please ensure that the generated question reflects the user instructions above. Incorporate all relevant details while adhering to the specified guidelines.`
          }
        } else if (rawQType.includes("written") || rawQType.includes("long") || rawQType.includes("essay")) {
          // Written response / Long Answer
          const domainInfo = isStudyLOEnabled ? `based exclusively on the ${Snumber} Domain and Domain name is '${selectedChapterName}'.` : "";
          const loInfo = isStudyLOEnabled ? `Each question should align with the content of the study material and the corresponding Learning Objective: ${LOs},but **do not repeat or closely mirror the exact wording** of the LO statement. \nInstead, the questions should assess the application and deeper understanding of the content related to that learning objective.` : "Each question should assess the application and deeper understanding of the content.";
          const pointInfoSnippet = isPointValueEnabled ? `for ${marks} marks` : "";
          const keyPointSnippet = isPointValueEnabled ? `Generate the Key Points exactly based on the Number of marks selected and the marks is ${marks}.(Eg. if mars is 3 then 3 key points should be generated, if marks is 10 then 10 key points should be given)` : "Generate relevant key points for each question.";

          if (selectedOption === 'LLM') {
            setGeneratedquestionSource('LLM');
            const promptContext = programname ? programname : domainInfo;
            question = `Generate exactly ${selectedNumberOfQuestions} Long Answer questions ${promptContext}\n${loInfo}\n${isPointValueEnabled ? `The marks is ${marks}. ` : ""}IMPORTANT: ${keyPointSnippet}`;
          } else {
            setGeneratedquestionSource('Book Based');
            question = `Generate exactly ${selectedNumberOfQuestions} Long Answer questions ${pointInfoSnippet}.\nQuestions ${domainInfo} \n${loInfo}\n${isPointValueEnabled ? `The marks is ${marks}. ` : ""}IMPORTANT: ${keyPointSnippet}`;
          }
          if (additionalInstructionText != '' && additionalInstructionText != null) {
            question = question + `\nUser Instructions:\n${additionalInstructionText}\n**Important:** Make sure each question and its options follow the user instruction while generating. Please ensure that the generated question reflects the user instructions above. Incorporate all relevant details while adhering to the specified guidelines.`
          }
        } else if (rawQType.includes("scenario")) {
          // Scenario Based
          const domainInfo = isStudyLOEnabled ? `based exclusively on the ${Snumber} Domain and domain name is '${selectedChapterName}'.` : "";
          const loInfo = isStudyLOEnabled ? `Each question should align with the content of the study material and the corresponding Enabling Objective: ${LOs},but **do not repeat or closely mirror the exact wording** of the EO statement. \nInstead, Each questions should assess the application and deeper understanding of the content related to that Enabling objective.` : "Each question should assess the application and deeper understanding of the content.";
          const pointInfo = isPointValueEnabled ? `The marks is ${marks}` : "";
          const distractorText = isResponseOptionsEnabled ? `Provide exactly ${selectedDistractor} options per question, labelled A to ${String.fromCharCode(64 + selectedDistractor)}.` : "Provide exactly 4 options per question, labelled A to D.";
          const scenarioInstruction = "\nIMPORTANT: Generate SCENARIO-BASED multiple-choice questions. Each question MUST begin with a detailed real-world scenario, case study, or problem context, followed by the actual question.";

          if (selectedOption === 'LLM') {
            setGeneratedquestionSource('LLM');
            const promptContext = programname ? programname : domainInfo;
            question = `Generate exactly ${selectedNumberOfQuestions} Scenario Based Multiple Choice questions ${promptContext} \n${loInfo}\n${pointInfo}\n${distractorText}${scenarioInstruction}`;
          } else {
            setGeneratedquestionSource('Book Based');
            question = `Generate exactly ${selectedNumberOfQuestions} Scenario Based Multiple Choice questions ${domainInfo} \n${loInfo}\n${pointInfo}\n${distractorText}${scenarioInstruction}`;
          }
          if (additionalInstructionText != '' && additionalInstructionText != null) {
            question = question + `\nUser Instructions:\n${additionalInstructionText}\n**Important:** Make sure each question and its options follow the user instruction while generating. Please ensure that the generated question reflects the user instructions above. Incorporate all relevant details while adhering to the specified guidelines.`
          }
        } else if (rawQType.includes("multi") && rawQType.includes("tab") && rawQType.includes("passage")) {
          // Multi Tab Passage
          const domainInfo = isStudyLOEnabled ? `based exclusively on the ${Snumber} Domain and domain name is '${selectedChapterName}'.` : "";
          const loInfo = isStudyLOEnabled ? `Each question should align with the content of the study material and the corresponding Enabling Objective: ${LOs}.` : "Each question should assess the application and deeper understanding of the content.";
          const pointInfo = isPointValueEnabled ? `The marks is ${marks}` : "";
          const distractorText = isResponseOptionsEnabled ? `Provide exactly ${selectedDistractor} options per question, labelled A to ${String.fromCharCode(64 + selectedDistractor)}.` : "Provide exactly 4 options per question, labelled A to D.";
          const passageInstruction = "\nIMPORTANT: Generate a passage-based question where the student must analyze a passage to answer multiple-choice questions. The passage should be formatted to be presented across multiple tabs or sections if necessary.";

          if (selectedOption === 'LLM') {
            setGeneratedquestionSource('LLM');
            const promptContext = programname ? programname : domainInfo;
            question = `Generate exactly ${selectedNumberOfQuestions} Multi Tab Passage questions ${promptContext} \n${loInfo}\n${pointInfo}\n${distractorText}${passageInstruction}`;
          } else {
            setGeneratedquestionSource('Book Based');
            question = `Generate exactly ${selectedNumberOfQuestions} Multi Tab Passage questions ${domainInfo} \n${loInfo}\n${pointInfo}\n${distractorText}${passageInstruction}`;
          }
          if (additionalInstructionText != '' && additionalInstructionText != null) {
            question = question + `\nUser Instructions:\n${additionalInstructionText}\n**Important:** Make sure each question and its options follow the user instruction while generating. Please ensure that the generated question reflects the user instructions above. Incorporate all relevant details while adhering to the specified guidelines.`
          }
        } else if (rawQType.includes("select the blank") || rawQType.includes("select the blanks")) {
          // Select the Blank / Fill In the Blank Dropdown.
          // NOTE: without this branch "select the blank" matches none of the keywords above
          // (not even "fill"/"gap") and falls through to the Multiple Choice default, which
          // is why the service returned an MCQ-shaped question instead of a dropdown one.
          const domainInfo = isStudyLOEnabled ? `based exclusively on the ${Snumber} Domain and Domain name is '${selectedChapterName}'.` : "";
          const loInfo = isStudyLOEnabled ? `Each question should align with the content of the study material and the corresponding Learning Objective: ${LOs},but **do not repeat or closely mirror the exact wording** of the LO statement. \nInstead, the questions should assess the application and deeper understanding of the content related to that learning objective.` : "Each question should assess the application and deeper understanding of the content.";
          const pointInfoSnippet = isPointValueEnabled ? `for ${marks} marks` : "";
          const keyPointSnippet = isPointValueEnabled ? `Generate the Key Points exactly based on the Number of marks selected and the marks is ${marks}.(Eg. if mars is 3 then 3 key points should be generated, if marks is 10 then 10 key points should be given)` : "Generate relevant key points for each question.";

          if (selectedOption === 'LLM') {
            setGeneratedquestionSource('LLM');
            const promptContext = programname ? programname : domainInfo;
            question = `Generate exactly ${selectedNumberOfQuestions} Select the Blank questions ${promptContext}\n${loInfo}\n${isPointValueEnabled ? `The marks is ${marks}. ` : ""}IMPORTANT: ${keyPointSnippet}`;
          } else {
            setGeneratedquestionSource('Book Based');
            question = `Generate exactly ${selectedNumberOfQuestions} Select the Blank questions ${pointInfoSnippet}.\nQuestions ${domainInfo} \n${loInfo}\n${isPointValueEnabled ? `The marks is ${marks}. ` : ""}IMPORTANT: ${keyPointSnippet}`;
          }
          if (additionalInstructionText != '' && additionalInstructionText != null) {
            question = question + `\nUser Instructions:\n${additionalInstructionText}\n**Important:** Make sure each question and its options follow the user instruction while generating. Please ensure that the generated question reflects the user instructions above. Incorporate all relevant details while adhering to the specified guidelines.`
          }
        } else {
          // Default: Multiple Choice
          const domainInfo = isStudyLOEnabled ? `based exclusively on the ${Snumber} Domain and domain name is '${selectedChapterName}'.` : "";
          const loInfo = isStudyLOEnabled ? `Each question should align with the content of the study material and the corresponding Enabling Objective: ${LOs},but **do not repeat or closely mirror the exact wording** of the EO statement. \nInstead, Each questions should assess the application and deeper understanding of the content related to that Enabling objective.` : "Each question should assess the application and deeper understanding of the content.";
          const pointInfo = isPointValueEnabled ? `The marks is ${marks}` : "";
          const distractorText = isResponseOptionsEnabled ? `Provide exactly ${selectedDistractor} options per question, labelled A to ${String.fromCharCode(64 + selectedDistractor)}.` : "Provide exactly 4 options per question, labelled A to D.";

          if (selectedOption === 'LLM') {
            setGeneratedquestionSource('LLM');
            const promptContext = programname ? programname : domainInfo;
            question = `Generate exactly ${selectedNumberOfQuestions} Multiple Choice questions ${promptContext} \n${loInfo}\n${pointInfo}\n${distractorText}`;
          } else {
            setGeneratedquestionSource('Book Based');
            question = `Generate exactly ${selectedNumberOfQuestions} Multiple Choice questions ${domainInfo} \n${loInfo}\n${pointInfo}\n${distractorText}`;
          }
          // shared additional instructions appended later
        }
        question = appendAdditional(question)
        const isTaxonomyFeatureEnabled = String(getSession("isTaxonomyEnabled", "true")).toLowerCase() === "true"
        const isCreativityEnabled = String(getSession("isCreativityLevelEnabled", "true")).toLowerCase() === "true"

        // Map selectedCreativityLevel to numeric ID: Moderate=1, High=2, Very High=3
        const rawCreativity = String(getSession("selectedCreativityLevel", "")).trim();
        const creativityMap = (val: string): number | undefined => {
          if (!val) return undefined;
          const num = Number(val);
          if (!Number.isNaN(num) && num > 0) return num; // already an id like 1/2/3
          const v = val.toLowerCase();
          if (v.includes('moderate')) return 1;
          if (v.includes('very') && v.includes('high')) return 3;
          if (v.includes('high')) return 2;
          if (v === 'all' || v.includes('all level') || v === '0') return undefined;
          return undefined;
        };
        const mappedCreativityLevel = creativityMap(rawCreativity);

        const selectedTaxonomyName = String(getSession("selectedTaxonomy", "")).trim()
        const hasTaxonomy = isTaxonomyFeatureEnabled && selectedTaxonomyName.length > 0
        const rawTaxonomyId = String(getSession("taxonomyid", "")).trim()
        const mappedTaxonomyId = hasTaxonomy ? (Number(rawTaxonomyId || "1") || 1) : undefined

        const buildGuidelineIdsCsv = async () => {
          const ids = new Set<string>()

          const addCsv = (raw: string) => {
            raw
              .split(",")
              .map(s => s.trim())
              .filter(Boolean)
              .forEach(id => ids.add(id))
          }

          const addSingle = (raw: string) => {
            const v = raw.trim()
            if (v && v !== "0") ids.add(v)
          }

          try {
            const fromMainBadges = String(getSession("selectedGuidelineIdsFromGuidlines", "") || "")
            if (fromMainBadges) addCsv(fromMainBadges)
          } catch { }

          try {
            const legacy = String(getSession("selectedGuidelineIds", "") || "")
            if (legacy) addCsv(legacy)
          } catch { }

          try {
            const single = String(getSession("selectedGuideline", "") || "")
            if (single) addSingle(single)
          } catch { }

          try {
            const rawSelectedGuidelines = sessionStorage.getItem("selectedGuidelines")
            if (rawSelectedGuidelines) {
              try {
                const parsed = JSON.parse(rawSelectedGuidelines)
                if (Array.isArray(parsed)) {
                  parsed
                    .map(v => String(v).trim())
                    .filter(v => v && v !== "0")
                    .forEach(v => ids.add(v))
                } else if (typeof parsed === "string") {
                  addCsv(parsed)
                }
              } catch {
                addCsv(String(rawSelectedGuidelines))
              }
            }
          } catch { }

          // Auto-fetch the Select the Blank guideline whenever it is missing.
          // It is published as "SELECT_THE_BLANK" in the unfiltered guideline
          // pool, so the old lookup (guidelinetype "Question Generation",
          // guidelinename "Select the Blank") never matched and the guideline
          // was silently dropped from the generation request. It also has to run
          // even when other guideline ids are already present.
          if (question_type === "SELECT_THE_BLANK") {
            try {
              const normalize = (s: any) => String(s || "").toLowerCase().replace(/[\s_-]+/g, "")
              const guidelinePayload = {
                par_kid: "0",
                par_guidelinetype: "0",
                par_guidelinename: "0",
                par_orgcode: configPayload.orgcode || "0",
                par_custcode: configPayload.custcode || "0",
                par_appcode: "0",
                book_id: ""
              }
              const guidelineResp = await axios.post(
                API_ENDPOINTS.GET_GENERAL_GUIDELINES,
                guidelinePayload
              )
              const guidelineList = Array.isArray(guidelineResp?.data)
                ? guidelineResp.data
                : Array.isArray(guidelineResp?.data?.data)
                  ? guidelineResp.data.data
                  : []

              const wanted = ["selecttheblank", "fillintheblankdropdown"]
              const selectTheBlankGuideline = guidelineList.find((g: any) =>
                wanted.includes(normalize(g.guidelinename || g.guideline_name || g.name))
              )
              if (selectTheBlankGuideline) {
                const guidelineId = String(
                  selectTheBlankGuideline.guidelineid || selectTheBlankGuideline.guideline_id || selectTheBlankGuideline.id || ""
                )
                if (guidelineId && guidelineId !== "0") {
                  ids.add(guidelineId)
                }
              } else {
                console.warn("SELECT_THE_BLANK guideline not found in the guideline list")
              }
            } catch (err) {
              console.warn("Failed to fetch SELECT_THE_BLANK guideline:", err)
            }
          }

          return Array.from(ids).join(",")
        }

        const commonPayload: any = {
          url: getSession("aig_url", getSession("url", "Testing/IIC/CYBER_RISK")),
          question,
          agenticItemGenIds: (history.state?.usr?.agenticItemGenIds) || "",  // or read from location/state/session, depending how you wired it
          source: sessionStorage.getItem("selectedGenerationMode"),
          custcode: configPayload.custcode,
          orgcode: configPayload.orgcode,
          usercode: getSession("usercode", userInfo.userCode || ""),
          appcode: configPayload.appcode,
          booknameid: Number(getSession("bookType", "")) || undefined,
          bookname: isSSOType3 ? (sessionStorage.getItem("bookname") || "") : (sessionStorage.getItem("bookTitle") || ""),
          bookcode: getSession("bookcode", ""),
          questiontypename: questiontypename,
          questiontypeid: isQuestionFormatEnabled ? (Number(getSession("questiontypeid", "1")) || 1) : 1,
          taxonomyid: isTaxonomyEnabled ? (Number(getSession("taxonomyid", "1")) || 1) : 1,
          difficultylevelid: Number(getSession("difficultylevelid", "1")) || 1,
          chaptercode: isStudyLOEnabled ? getSession("chaptercode", getSession("selectedChapter", "")) : "",
          locode: isStudyLOEnabled ? getSession("selectedLO", "") : "",
          sourcetype: Number(getSession("sourcetype", "1")) || 1,
          referenceinfo: getSession("referenceinfo", ""),
          noofquestions: isQuestionQuantityEnabled ? (Number(getSession("selectedQuantity", getSession("noofquestions", "1"))) || 1) : 1,
          creativitylevel: isCreativityLevelEnabled ? mappedCreativityLevel : "High",
          Rating: "",
          job_id: sessionStorage.getItem("job_id") || null,
          Rating_Feedback: sessionStorage.getItem("ratingFeedback") || "",
          kbname: isStudyLOEnabled ? (sessionStorage.getItem("selectedChapterName") || "").replace(/\s+/g, "_") : "",
          sourcename: configPayload.sourcename,
          validate_content: getSession("validate_content", "No"),
          taxonomyname: isTaxonomyEnabled ? (sessionStorage.getItem("selectedTaxonomy") || "") : "",
          task_content: getSession("task_content", ""),
          question_type: question_type,
          kbid: getSession("selectedKnowledgeBaseIdsCsv", "") || undefined,
          gid: await buildGuidelineIdsCsv(),
          reference_link: getSession("reference_link", ""),
          difficulty_level_name: getSession("difficulty_level_name", ""),
          isagentic: false,
          // Only sent when the user opted in via "Generate Images for Questions".
          ...(sessionStorage.getItem('includeQuestionImages') === 'true' ? { isimage: '1' } : {}),
          question_source: generatedQuestionSource,
          distractors: isResponseOptionsEnabled ? (Number(getSession("selectedDistractor", "4")) || 4) : 4,
          // The three values this page uses to build the prompt that were not
          // reachable from the payload before. They let the backend rebuild
          // `question` itself when it is sent empty.
          // All three are OPTIONAL: left out, the backend falls back to this
          // page's own control defaults (1 mark, 2 correct options, no user
          // instructions), so a client that omits them keeps working.
          ...(marks ? { marks } : {}),
          // getSession returns "" when unset, so this is 0 rather than NaN then
          // — send it only when the author actually chose a value.
          ...(numberOfCorrectOptions > 0 ? { numberofcorrectoptions: numberOfCorrectOptions } : {}),
          ...(additionalInstructionText && additionalInstructionText !== "null"
            ? { additionalinstructions: additionalInstructionText }
            : {})
        }

        // Keep the exact request that produced these questions, so "Regenerate Item"
        // on the results page can reuse the same book / study / guideline context.
        try {
          sessionStorage.setItem("aigLastGenPayload", JSON.stringify(commonPayload))
        } catch (e) {
          console.warn("Could not store the generation payload for regeneration", e)
        }

        // Run agents sequentially: agent 1 -> agent 2 -> agent 3
        const results: Array<{ index: number; data?: any; error?: any }> = []
        let completed = 0
        const total = activeAgents.length

        // Track a job_id provided by any agent and propagate to subsequent agents
        let storedJobId: string | null = null
        try {
          const sj = getSession('job_id', null)
          storedJobId = sj && sj !== 'undefined' ? String(sj) : null
        } catch (e) {
          storedJobId = null
        }
        if (storedJobId) {
          commonPayload.job_id = storedJobId
        }

        for (let index = 0; index < total; index++) {
          const a = activeAgents[index]
          // Mark only current agent as processing
          setStepStatuses(prev => ({ ...prev, [index]: "processing" }))
          const payload = {
            ...commonPayload,
            agentname: a.agentname,
            agent_status: String(a.agentstatus)
          }
          // For the first agent, explicitly send job_id: null if not available
          if (index === 0) {
            if (!storedJobId) {
              (payload as any).job_id = null
            } else {
              (payload as any).job_id = storedJobId
            }
          }
          // For subsequent agents, include job_id only if we have captured one
          if (index > 0 && storedJobId) {
            (payload as any).job_id = storedJobId
          }
          try {
            // Debug: log payload before POST to inspect job_id and question_type
            try { console.debug('[AIG] Posting to agentic_item_gen payload:', { agent: a.agentname, job_id: (payload as any).job_id, question_type: (payload as any).question_type, questiontypename: (payload as any).questiontypename }) } catch (e) { }
            const res = await axios.post(AGENTIC_ITEM_GEN_URL, payload)
            // store job_id if present in response.data.details or response.data
            const jobId = res?.data?.details?.job_id || res?.data?.job_id
            if (jobId) {
              storedJobId = String(jobId)
              try {
                sessionStorage.setItem('job_id', String(jobId))
              } catch (e) {
                console.warn('Could not store job_id in sessionStorage', e)
              }
              // update commonPayload so next agent gets this job_id
              try { commonPayload.job_id = storedJobId } catch (e) { }
              console.log('Job ID stored:', jobId)
            }
            results.push({ index, data: res.data })
          } catch (err) {
            // if error response contains job_id, store it too
            const jobId = err?.response?.data?.details?.job_id || err?.response?.data?.job_id
            if (jobId) {
              storedJobId = String(jobId)
              try {
                sessionStorage.setItem('job_id', String(jobId))
              } catch (e) {
                console.warn('Could not store job_id in sessionStorage', e)
              }
              try { commonPayload.job_id = storedJobId } catch (e) { }
              console.log('Job ID stored (error response):', jobId)
            }
            results.push({ index, error: err })
          } finally {
            completed += 1
            setStepStatuses(prev => ({ ...prev, [index]: "complete" }))
            // Progress increments evenly per agent completion
            setProgress(Math.max(10, Math.round((completed / total) * 100)))
          }
        }

        // Only generate images when the user enabled the "Generate Images for Questions" toggle.
        const shouldGenerateImages = sessionStorage.getItem('includeQuestionImages') === 'true';
        if (shouldGenerateImages) {
          setIsGeneratingImages(true)
          setProgress(100)
          await generateImagesForGeneratedQuestions(results)
          setIsGeneratingImages(false)
        }

        try {
          // Collapse the over-escaped LaTeX the generator returns ("\\(\frac{3}{8}\\)")
          // once, here, so every reader — the results screen, the edit dialog, the
          // Word/Excel export and the saved payload — sees proper equations.
          const { normalizeGeneratedLatex } = await import('@/utils/latexNormalize')
          const normalizedResults = normalizeGeneratedLatex(results)
          // storeGeneratedResults keeps the questions even when the generated
          // images make the payload too big for session storage — it gives up the
          // pictures instead of the whole result.
          const { storeGeneratedResults } = await import('@/utils/generatedResultsStorage')
          const outcome = await storeGeneratedResults({ agents: activeAgents, results: normalizedResults })
          if (!outcome.stored) {
            console.error("Failed to store questionGenResults: the payload does not fit in session storage")
          }
        } catch (e) {
          console.error("Failed to store questionGenResults", e)
          try {
            const { storeGeneratedResults } = await import('@/utils/generatedResultsStorage')
            await storeGeneratedResults({ agents: activeAgents, results })
          } catch { /* ignore */ }
        }
        // After all agents finish, remove job_id from sessionStorage as requested
        try {
          sessionStorage.removeItem('job_id')
        } catch (e) {
          console.warn('Could not remove job_id from sessionStorage', e)
        }

        setTimeout(() => navigate("/advanced-question-results"), 800)
      } catch (error) {
        console.error("Agentic workflow error:", error)
        // Minimal fallback on error
        setSteps([
          { title: "Processing", subtitle: "Starting fallback sequence" },
          { title: "Finalizing", subtitle: "Preparing results" }
        ])
        setStepStatuses({ 0: "processing", 1: "pending" })
        setProgress(50)
        setTimeout(() => {
          setStepStatuses({ 0: "complete", 1: "complete" })
          setProgress(100)
          navigate("/advanced-question-results")
        }, 1200)
      }
    }

    startAgenticWorkflow()
  }, [navigate])

  const getStepStatus = (index: number) => {
    const status = stepStatuses[index]
    if (status) return status
    // fallback logic if statuses not set
    if (index < currentStep) return "complete"
    if (index === currentStep) return "processing"
    return "pending"
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative overflow-hidden">
      {/* Subtle Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-blue-100 rounded-full opacity-50 animate-pulse" />
        <div className="absolute bottom-20 right-20 w-40 h-40 bg-purple-100 rounded-full opacity-40 animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-10 w-24 h-24 bg-indigo-100 rounded-full opacity-30 animate-pulse" style={{ animationDelay: '4s' }} />
      </div>

      {/* Header */}
      {!isSSO && (
        <div className="bg-white border-b border-gray-200 px-6 py-4 relative z-10">
          <div className="flex items-center gap-3">

            <img
              src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
              alt="AI-Levate"
              className="h-10 w-auto"
            />
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-gray-400">•</span>
              <span className="text-sm text-blue-600 font-medium">Processing your request...</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="max-w-5xl w-full space-y-8">
          {/* AI Brain Section */}
          <div className="flex justify-center">
            <div className="relative">
              {/* Main brain container */}
              <div className="relative w-32 h-32 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
                <Brain className="w-16 h-16 text-white animate-pulse" />
              </div>

              {/* Status indicator */}
              <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>

          {/* Title and Description */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-gray-900 animate-fade-in">
              {isGeneratingImages ? "Generating Images for Your Questions" : "AI is Generating Your Questions"}
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
              {isGeneratingImages
                ? "Questions are ready. We are creating visual aids and diagrams for applicable questions."
                : "Our AI is analyzing your content and creating high-quality assessment questions."}
            </p>
            {/* Shown for the whole generation, so it is larger than the generator page's version. */}
            <p role="note" className="flex items-center justify-center gap-2 text-xl font-medium text-blue-700">
              <Info className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <span><strong className="font-bold">Note:</strong> Initial question generation may take some time.</span>
            </p>
          </div>

          {/* Progress Section */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-800">
                  {isGeneratingImages ? "Image Generation Progress" : "Processing Progress"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-blue-600">{progress}%</span>
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                </div>
              </div>

              <Progress value={progress} className="h-3 bg-gray-200" />

              {/* Processing Steps */}
              <div className="space-y-3 mt-6">
                {steps.map((step, index) => {
                  const status = getStepStatus(index)
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-300 ${status === "complete"
                        ? "bg-green-50 border border-green-200"
                        : status === "processing"
                          ? "bg-blue-50 border border-blue-200"
                          : "bg-gray-50 border border-gray-200"
                        }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status === "complete"
                        ? "bg-green-500"
                        : status === "processing"
                          ? "bg-blue-500"
                          : "bg-gray-400"
                        }`}>
                        {status === "complete" ? (
                          <Check className="w-6 h-6 text-white" />
                        ) : status === "processing" ? (
                          <Target className="w-6 h-6 text-white animate-spin" />
                        ) : (
                          <Check className="w-6 h-6 text-white opacity-50" />
                        )}
                      </div>

                      <div className="flex-1">
                        <h3 className={`text-base font-semibold mb-1 ${status === "complete" ? "text-green-900" :
                          status === "processing" ? "text-blue-900" : "text-gray-500"
                          }`}>
                          {step.title}
                        </h3>
                        <p className={`text-sm ${status === "complete" ? "text-green-700" :
                          status === "processing" ? "text-blue-700" : "text-gray-400"
                          }`}>
                          {step.subtitle}
                        </p>
                      </div>

                      {status === "complete" && (
                        <div className="text-sm font-medium text-green-600 flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full">
                          <Check className="w-3 h-3" />
                          Complete
                        </div>
                      )}
                      {status === "processing" && (
                        <div className="text-sm font-medium text-blue-600 flex items-center gap-2 bg-blue-100 px-3 py-1 rounded-full">
                          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          Processing...
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {isGeneratingImages && (
                <div className="mt-4 p-4 rounded-xl border border-purple-200 bg-purple-50">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-purple-900">Please wait while images are generated</p>
                      <p className="text-sm text-purple-700 mt-1">
                        Agent process is complete. We are now generating question visuals before taking you to results.
                      </p>
                    </div>
                    <div className="text-sm font-medium text-purple-600 flex items-center gap-2 bg-purple-100 px-3 py-1 rounded-full">
                      <div className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                      Generating...
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-6 text-center border border-gray-200 shadow-sm"
              >
                <div className="flex justify-center mb-4">
                  <div className={`w-12 h-12 bg-gradient-to-br ${feature.bgColor} rounded-xl flex items-center justify-center`}>
                    <div className="text-white">
                      {feature.icon}
                    </div>
                  </div>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.subtitle}</p>
              </div>
            ))}
          </div>

          {/* Footer Message */}
          <div className="text-center bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
            <p className="text-gray-600 font-medium">
              {isGeneratingImages
                ? "Image generation is in progress. This may take a few extra moments..."
                : "Please wait while our AI processes your request. This may take a few moments..."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIGQuestionGenerationLoading
