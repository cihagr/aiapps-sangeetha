import axios from "axios";

// Get item generation endpoint from environment variable
const ITEM_GEN_API_URL = import.meta.env.VITE_ITEM_GEN_API_URLs;


// New function for item generation logic
const initiateItemGeneration = async (params, setCurrentStep, setProgress, navigate, setAgentStatusObj, setpleaswwaitmsg, setagentstatus) => {
  try {
    // Get user info from localStorage (expects userInfo as JSON with userCode, custCode, orgCode)
    let usercode = "";
    let custcode = "";
    let orgcode = "";
    try {
      const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
      usercode = userInfo.userCode || "";
      custcode = userInfo.custCode || "";
      orgcode = userInfo.orgCode || "";
    } catch (e) {
      usercode = "";
      custcode = "";
      orgcode = "";
    }
    // Prepare the base payload from params and localStorage
    // All values for appcode, booknameid, questiontypeid, taxonomyid, difficultylevelid, chaptercode, locode, sourcetype, referenceinfo, noofquestions, agent_status are now taken from localStorage (if available), else fallback to defaults
    // Use the number of questions from params.selectedQuantity if provided, else fallback to params.noofquestions, then localStorage or default to 1
    const noofquestions =
      (params && params.selectedQuantity !== undefined)
        ? Number(params.selectedQuantity)
        : (params && params.noofquestions !== undefined)
          ? Number(params.noofquestions)
          : (sessionStorage.getItem("noofquestions")
            ? Number(sessionStorage.getItem("noofquestions"))
            : 1);
    sessionStorage.setItem("selectedQuantity", noofquestions.toString());
            
    // Determine question type string for prompt (normalize to match exactly)
    let questionType = "";
    if (params && params.questiontypeid !== undefined) {
      questionType = params.questiontypeid;
    } else if (sessionStorage.getItem("selectedQuestionType")) {
      questionType = sessionStorage.getItem("selectedQuestionType");
    }
    // Normalize to match logic below
    if (typeof questionType === "string") {
      const qtype = questionType.trim().toLowerCase();
      if (qtype === "multiple choice" || qtype === "multiple-choice") {
        questionType = "Multiple Choice";
      } else if (qtype === "written response" || qtype === "written-response") {
        questionType = "Written Response";
      }
    }

    // Get pointValue from params, localStorage, or fallback
    let pointValue = Number(sessionStorage.getItem("pointValue"));
    // if (params && params.pointValue !== undefined) {
    //   //pointValue = params.pointValue;
    //   pointValue = Number(sessionStorage.getItem("pointValue"));
    // } else if (sessionStorage.getItem("pointValue")) {
    //   pointValue = Number(sessionStorage.getItem("pointValue"));
    // }

    let minword = 100;
    if(pointValue == 10){
      minword = 250;
    }
    // Get study name
    let studyName = params && params.chapter ? params.chapter : (sessionStorage.getItem("selectedChapterName") || " ");
    let studynumber = params && params.studynumber ? params.studynumber : "";
    let learningObj= params && params.loName ? params.loName : "";
    let taxonomy= params && params.taxonomyid ? params.taxonomyid : "";
    let selOption= params && params.selectedOption ? params.selectedOption:"";
    let Lo_Pnumber= params && params.Lo_Pnumber ? params.Lo_Pnumber : "";
    let selectedDistractor = sessionStorage.getItem("selectedResponseOptions") || "4";
    // if(params && params.chapter){
    //   studyName = params.chapter;
    // }else if(sessionStorage.getItem("selectedChapterName")){
    //   studyName = sessionStorage.getItem("selectedChapterName") || "";
    // }

    // Build payload based on question type
    sessionStorage.setItem("selectedLoName", learningObj);
    sessionStorage.setItem("studyName", studyName);
    sessionStorage.setItem("selectedTaxonomy", taxonomy);
    // Determine effective learning objective: params.loName takes precedence, else sessionStorage selectedLO (default ALL)
    const selectedLOFromSession = sessionStorage.getItem("selectedLO") || "ALL";
    const effectiveLO = (params && params.loName) ? params.loName : selectedLOFromSession;
    const includeLOClause = !(effectiveLO === "ALL" || !effectiveLO || effectiveLO === "");
    const loClause = includeLOClause
      ? `Each question should align with the content of the study material and the corresponding Learning Objective: ${effectiveLO},but **do not repeat or closely mirror the exact wording** of the LO statement. Instead, the questions should assess the application and deeper understanding of the content related to that learning objective.`
      : "";

    let basePayload;
    if (questionType === "Written Response") {
      if(selOption == 'LLM'){
  const question = 
  `Generate exactly ${noofquestions} Long Answer questions for ${pointValue} marks. Questions based exclusively on the ${studynumber} Study and study name is '${studyName}'. ${loClause}
  Each question must adhere to the specified Taxonomy: ${taxonomy}. Each question must reflect content strictly from the specified study material.
        Important:
        1.Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages '${Lo_Pnumber}' allocated to that learning objective.
        2.Clearly state that the page number must be drawn from this specified range only.
        3.Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        4.If the Taxonomy is 'apply', each question should include a scenario.
        5.Do not create or include multi-part questions labeled with (a), (b), etc. Always write questions as a single, unified prompt without splitting into sub-parts. Ensure the question flows naturally and assesses all required elements cohesively.
        Key Points Structure:
        - Provide Header and its detailed complete explanation with min 20 words and max 50 words. Explanation should be minimum 20 words.
          Example:
          1. Initial deductible ~ The insured pays the first $500 of a claim before coverage applies.
          2. Insurer’s liability ~ The insurer covers all valid claims after the deductible is met.
          3. Risk mitigation ~ Deductibles discourage small claims by sharing financial responsibility.
          4. Premium adjustment ~ Higher deductibles reduce premiums by transferring risk to the insured.

        Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        The output format should be in JSON, structured as follows:
        [{
          'label': <Question>,
          'values': [],
          'CorrectAnswer': <Correct Answer(minimum 100 words). Do not include textbook references, page numbers, study names, or learning objective (LO) names in the correct answer.>,
          'KeyPoints': <Must follow the above key points Structure. List exactly ${pointValue} key points, each contributing 1 mark. Do not include any references, study numbers, learning objectives, examples, or page numbers within the key points. Focus only on the essential content of the chapter and format should be <Keypoint> ~ <Explanation of the key point>. Provide keypoints in an array>,
          'MaxMarks': ${pointValue},
          'BookName': <List the book name which have referred if possible>,
          'LearningObjective': <for which learning objective question belongs to. Provide learning objective name, it should be same as in book, not number. Do not give word like this 'Consider all learning objectives within study'>,
          'ReferenceInfo': <must provide study number(use study number 1st. do not use 'th','st','nd','rd' with numbers), Learning objective number, Page number. Not provide format of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of '${Lo_Pnumber}'. Clearly state that the page number must be drawn from this specified range only. Do not provide book name, study names and learning objective name. The format must be exactly as follows: 'Study ${studynumber}, Learning Objective <Learning Objective number>, Page <Page number>'.>
        }]
        The number of questions should be exactly ${noofquestions}.
        Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
        basePayload = {
          url: "Testing/IIC/CYBER_RISK",
          //question: "Generate exactly " + noofquestions + " Long Answer questions for " + pointValue + " marks. Questions based exclusively on the 1st Study and study name is 'Defining Risk and Cyber Risk'. The questions should align with the content of the study material and the corresponding Learning Objective:dgfgfgfdgfdgf,but **do not repeat or closely mirror the exact wording** of the LO statement. Instead, the questions should assess the application and deeper understanding of the content related to that learning objective.The questions must adhere to the specified Taxonomy: Remember. Each question must reflect content strictly from the specified study material. Important: Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages 'Learning objective 1 : pages from 1-3 to 1-6,Learning objective 2 : pages from 1-7 to 1-14,Learning objective 3 : pages from 1-15 to 1-20,' allocated to that learning objective. Clearly state that the page number must be drawn from this specified range only..Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows:Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows: [{'label':<Question>, 'values':[],'CorrectAnswer':<Correct Answer(minimum 100 words)>,'KeyPoints':<List exactly 5 key points, each contributing 1 mark. Do not include any references, study numbers, learning objectives, examples, or page numbers within the key points. Focus only on the essential content of the chapter and format should be <Keypoint> - <Explanation of the key point> >,'MaxMarks':5,'BookName':<List the book name which have refered if possible>,LearningObjective': <for which learning objective question belongs to. Provide learning objective name,it should be same as in book, not number.do not give word like this 'Consider all learning objectives within study'>, 'ReferenceInfo': <must provide study number, Learning objective number,Page number. Not provide formate of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of 'Learning objective 1 : pages from 1-3 to 1-6,Learning objective 2 : pages from 1-7 to 1-14,Learning objective 3 : pages from 1-15 to 1-20,'. Clearly state that the page number must be drawn from this specified range only.do not provide book name,study names and learning objective name.The format must be exactly as follows: 'Study <Study Number>, Learning Objective <Learning Objective number>, Page <Page number>'.>}].The number of questions should be exactly 3.Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies. ",
          question: question,
          source: sessionStorage.getItem("source") || "Book",
          custcode: sessionStorage.getItem("custcode") || custcode,
          orgcode: sessionStorage.getItem("orgcode") || orgcode,
          usercode: sessionStorage.getItem("usercode") || usercode,
          appcode: sessionStorage.getItem("appcode") || "IG",
          booknameid: sessionStorage.getItem("bookType"),
          questiontypeid: Number(sessionStorage.getItem("questiontypeid")) || 1,
          taxonomyid: sessionStorage.getItem("taxonomyid") !== null && sessionStorage.getItem("taxonomyid") !== undefined && sessionStorage.getItem("taxonomyid") !== ""
            ? Number(sessionStorage.getItem("taxonomyid"))
            : 1,
          difficultylevelid: Number(sessionStorage.getItem("difficultylevelid")) || 1,
          chaptercode: sessionStorage.getItem("selectedChapter") || "S12",
          creativitylevel:sessionStorage.getItem('selectedCreativityLevel'),
          locode: sessionStorage.getItem("selectedLO") || "",
          sourcetype: Number(sessionStorage.getItem("sourcetype")) || 1,
          referenceinfo: sessionStorage.getItem("referenceinfo") || "",
          selectedQuantity: noofquestions,
          noofquestions: noofquestions,
          agent_status: sessionStorage.getItem("agent_status") || "3"
        };
      }
      else{
  const question = 
  `Generate exactly ${noofquestions} Long Answer questions for ${pointValue} marks. Questions based exclusively on the ${studynumber} Study and study name is '${studyName}'. ${loClause}
  Each question must adhere to the specified Taxonomy: ${taxonomy}. Each question must reflect content strictly from the specified study material.
        Important:
        1.Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages '${Lo_Pnumber}' allocated to that learning objective.
        2.Clearly state that the page number must be drawn from this specified range only.
        3.Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        4.If the Taxonomy is 'apply', each question should include a scenario.
        5.Do not create or include multi-part questions labeled with (a), (b), etc. Always write questions as a single, unified prompt without splitting into sub-parts. Ensure the question flows naturally and assesses all required elements cohesively.
        Key Points Structure:
        - Provide Header and its detailed complete explanation with min 20 words and max 50 words. Explanation should be minimum 20 words.
          Example:
          1. Initial deductible ~ The insured pays the first $500 of a claim before coverage applies.
          2. Insurer’s liability ~ The insurer covers all valid claims after the deductible is met.
          3. Risk mitigation ~ Deductibles discourage small claims by sharing financial responsibility.
          4. Premium adjustment ~ Higher deductibles reduce premiums by transferring risk to the insured.

        Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        The output format should be in JSON, structured as follows:
        [{
          'label': <Question>,
          'values': [],
          'CorrectAnswer': <Correct Answer(minimum 100 words). Do not include textbook references, page numbers, study names, or learning objective (LO) names in the correct answer.>,
          'KeyPoints': <Must follow the above key points Structure. List exactly ${pointValue} key points, each contributing 1 mark. Do not include any references, study numbers, learning objectives, examples, or page numbers within the key points. Focus only on the essential content of the chapter and format should be <Keypoint> ~ <Explanation of the key point>. Provide keypoints in an array>,
          'MaxMarks': ${pointValue},
          'BookName': <List the book name which have referred if possible>,
          'LearningObjective': <for which learning objective question belongs to. Provide learning objective name, it should be same as in book, not number. Do not give word like this 'Consider all learning objectives within study'>,
          'ReferenceInfo': <must provide study number(use study number 1st. do not use 'th','st','nd','rd' with numbers), Learning objective number, Page number. Not provide format of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of '${Lo_Pnumber}'. Clearly state that the page number must be drawn from this specified range only. Do not provide book name, study names and learning objective name. The format must be exactly as follows: 'Study ${studynumber}, Learning Objective <Learning Objective number>, Page <Page number>'.>
        }]
        The number of questions should be exactly ${noofquestions}.
        Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
            basePayload = {
              url: "Testing/IIC/CYBER_RISK",
              //question: "Generate exactly " + noofquestions + " Long Answer questions for " + pointValue + " marks. Questions based exclusively on the 1st Study and study name is 'Defining Risk and Cyber Risk'. The questions should align with the content of the study material and the corresponding Learning Objective: Explain why pure risk is insurable but speculative risk is not,but **do not repeat or closely mirror the exact wording** of the LO statement. Instead, the questions should assess the application and deeper understanding of the content related to that learning objective.The questions must adhere to the specified Taxonomy: Remember. Each question must reflect content strictly from the specified study material. Important: Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages 'Learning objective 1 : pages from 1-3 to 1-6,Learning objective 2 : pages from 1-7 to 1-14,Learning objective 3 : pages from 1-15 to 1-20,' allocated to that learning objective. Clearly state that the page number must be drawn from this specified range only..Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows:Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows: [{'label':<Question>, 'values':[],'CorrectAnswer':<Correct Answer(minimum 100 words)>,'KeyPoints':<List exactly 5 key points, each contributing 1 mark. Do not include any references, study numbers, learning objectives, examples, or page numbers within the key points. Focus only on the essential content of the chapter and format should be <Keypoint> - <Explanation of the key point> >,'MaxMarks':5,'BookName':<List the book name which have refered if possible>,LearningObjective': <for which learning objective question belongs to. Provide learning objective name,it should be same as in book, not number.do not give word like this 'Consider all learning objectives within study'>, 'ReferenceInfo': <must provide study number, Learning objective number,Page number. Not provide formate of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of 'Learning objective 1 : pages from 1-3 to 1-6,Learning objective 2 : pages from 1-7 to 1-14,Learning objective 3 : pages from 1-15 to 1-20,'. Clearly state that the page number must be drawn from this specified range only.do not provide book name,study names and learning objective name.The format must be exactly as follows: 'Study <Study Number>, Learning Objective <Learning Objective number>, Page <Page number>'.>}].The number of questions should be exactly 3.Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies. ",
              //question:"Generate exactly " + noofquestions + " Long Answer questions for " + pointValue + " marks.                 Questions based exclusively on the "+studynumber+" Study and study name is '"+studyName+"'.                  The questions should align with the content of the study material and the corresponding Learning Objective: "+learningObj+",but **do not repeat or closely mirror the exact wording** of the LO statement. Instead, the questions should assess the application and deeper understanding of the content related to that learning objective.                 The questions must adhere to the specified Taxonomy: "+taxonomy+". Each question must reflect content strictly from the specified study material.                Important:                   Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages '"+Lo_Pnumber+"' allocated to that learning objective.                   Clearly state that the page number must be drawn from this specified range only.                  .Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows:Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows: [{'label':<Question>, 'values':[],'CorrectAnswer':<Correct Answer(minimum "+minword+" words)>,'KeyPoints':<List exactly "+pointValue+" key points, each contributing 1 mark. Do not include any references, study numbers, learning objectives, examples, or page numbers within the key points. Focus only on the essential content of the chapter and format should be <Keypoint> - <Explanation of the key point> >,'MaxMarks':"+pointValue+",'BookName':<List the book name which have refered if possible>,LearningObjective': <for which learning objective question belongs to. Provide learning objective name,it should be same as in book, not number.do not give word like this 'Consider all learning objectives within study'>, 'ReferenceInfo': <must provide study number, Learning objective number,Page number. Not provide formate of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of '"+Lo_Pnumber+"'. Clearly state that the page number must be drawn from this specified range only.do not provide book name,study names and learning objective name.The format must be exactly as follows: 'Study <Study Number>, Learning Objective <Learning Objective number>, Page <Page number>'.>}].The number of questions should be exactly "+ noofquestions +".Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies. ",
              question: question,
              
              source: sessionStorage.getItem("source") || "Book",
              custcode: sessionStorage.getItem("custcode") || custcode,
              orgcode: sessionStorage.getItem("orgcode") || orgcode,
              usercode: sessionStorage.getItem("usercode") || usercode,
              appcode: sessionStorage.getItem("appcode") || "IG",
              booknameid: sessionStorage.getItem("bookType"),
              questiontypeid: Number(sessionStorage.getItem("questiontypeid")) || 1,
              taxonomyid: sessionStorage.getItem("taxonomyid") !== null && sessionStorage.getItem("taxonomyid") !== undefined && sessionStorage.getItem("taxonomyid") !== ""
                ? Number(sessionStorage.getItem("taxonomyid"))
                : 1,
              difficultylevelid: Number(sessionStorage.getItem("difficultylevelid")) || 1,
              chaptercode: sessionStorage.getItem("selectedChapter") || "S12",
              creativitylevel:sessionStorage.getItem('selectedCreativityLevel'),
              locode: sessionStorage.getItem("selectedLO") || "",
              sourcetype: Number(sessionStorage.getItem("sourcetype")) || 1,
              referenceinfo: sessionStorage.getItem("referenceinfo") || "",
              selectedQuantity: noofquestions,
              noofquestions: noofquestions,
              agent_status: sessionStorage.getItem("agent_status") || "3"
            };
      }      
    } else if (questionType === "Multiple Choice") {
      if(selOption == 'LLM')
      {
  const question = 
  `Generate exactly ${noofquestions} Multiple Choice questions based exclusively on the ${studynumber} Study and study name is '${studyName}'. ${loClause} Each question must adhere to the specified Taxonomy: ${taxonomy}. Each question must reflect content strictly from the specified study material.
        Important:
        1.For options that are complete sentences, **add a period at the end**.
        2.For options that are not complete sentences (e.g., single words,double words, phrases), **do not add a period**.
        3.Do not provide options with missing punctuation or inconsistent use of periods.
        4.Options must start with prefix A, B, C... up to the number of distractors specified in 'selectedDistractor' (e.g., if selectedDistractor is 5, include options A to E). Ensure exactly ${selectedDistractor} options per question.
        5.If the Taxonomy is 'apply', each question should include a scenario.
        6.Options should be exactly ${selectedDistractor}
        7.All Options/distarctors should be in same length.
        8.Avoid decimal points in options and question stem, use whole numbers only.
        Ensure the options follow these punctuation rules strictly.
        Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages '${Lo_Pnumber}' allocated to that learning objective. Clearly state that the page number must be drawn from this specified range only.
        Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows:
        [ { 'label': <Question>,
            'values': [<provide exactly ${selectedDistractor} Options with prefix A, B, C... up to z depending on the selectedDistractor.all distractors(options) should be in same length. Apply punctuation rules: complete sentences end with a period, phrases/words do not.>],
            'CorrectAnswer': <Correct option alphabet with full text. It must match one of the provided options (e.g., 'B. It is the correct definition.')>,
            'FeedbackOption<option>': <Correct/Incorrect.Feedback for the particular option. (e.g., 'FeedbackOptionA: Incorrect. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.','FeedbackOptionB: Correct. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.').In Json LHS side don't use the formate like this 'FeedbackOption<B>,FeedbackOption<A>...' use 'FeedbackOptionA,FeedbackOptionB..'.Must provide Feedback for the options >,
            'MaxMarks': 1,
            'LearningObjective': <for which learning objective question belongs to. Provide learning objective name,it should be same as in book, not number.do not give word like this 'Consider all learning objectives within study'>,
            'ReferenceInfo': <must provide study number(use study number 1st.do not use 'th','st','nd','rd' with numbers), Learning objective number, Page number. Not provide formate of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of '${Lo_Pnumber}'. Clearly state that the page number must be drawn from this specified range only.do not provide book name,study names and learning objective name.The format must be exactly as follows: 'Study ${studynumber}, Learning Objective <Learning Objective number>, Page <Page number>'.>,
            'BookName': <Book>,
            'creativityLevel':<this question belongs to which creativity level(moderate,high,very-high)>
        } ]
        The number of questions should be exactly ${noofquestions}.
        Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
        basePayload = {
          url: "Testing/IIC/CYBER_RISK",
          //question: "Generate exactly " + noofquestions + " Multiple Choice questions based exclusively on the "+studynumber+" Study and study name is '"+studyName+"'. The questions should align with the content of the study material and the corresponding Learning Objective:"+learningObj+",but **do not repeat or closely mirror the exact wording** of the LO statement. Instead, the questions should assess the application and deeper understanding of the content related to that learning objective.The questions must adhere to the specified Taxonomy:"+taxonomy+". Each question must reflect content strictly from the specified study material.Important: 1. For options that are complete sentences, **add a period at the end**.2. For options that are not complete sentences (e.g., single words,double words, phrases), **do not add a period**.3. Do not provide options with missing punctuation or inconsistent use of periods. 4. options must starts with prefix A., B., C., D.Ensure the options follow these punctuation rules strictly.Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages '' allocated to that learning objective. Clearly state that the page number must be drawn from this specified range only.Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows:[ { 'label': <Question>, 'values': [<provide Options with prefix ABCD.options must be added with period if option is complete sentence. If the option is not a complete sentence, do not add a period at the end.options must starts with prefix A, B, C, D>], 'CorrectAnswer': <Correct option alphabet with text. It also starts with the correct prefix (A, B, C, D).>, 'FeedbackOption<option>': <Correct/Incorrect. Feedback for the particular option>, 'MaxMarks': 1, 'LearningObjective': <for which learning objective question belongs to. Provide learning objective name,it should be same as in book, not number.do not give word like this 'Consider all learning objectives within study'>, 'ReferenceInfo': <must provide study number, Learning objective number, Page number. Not provide formate of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of 'Learning objective 1 : pages from 2-3 to 2-4,Learning objective 2 : pages from 2-4 to 2-13,Learning objective 3 : pages from 2-14 to 2-22,Learning objective 4 : pages from 2-23 to 2-25,Learning objective 5 : pages from 2-26 to 2-30,'. Clearly state that the page number must be drawn from this specified range only.do not provide book name,study names and learning objective name.The format must be exactly as follows: 'Study <Study Number>, Learning Objective <Learning Objective number>, Page <Page number>'.>, 'BookName': <Book> } ]The number of questions should be exactly " + noofquestions + ".Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.",
          question: question,
          source: sessionStorage.getItem("source") || "Book",
          custcode: sessionStorage.getItem("custcode") || custcode,
          orgcode: sessionStorage.getItem("orgcode") || orgcode,
          usercode: sessionStorage.getItem("usercode") || usercode,
          appcode: sessionStorage.getItem("appcode") || "IG",
          booknameid: sessionStorage.getItem("bookType"),
          questiontypeid: Number(sessionStorage.getItem("questiontypeid")) || 1,
          taxonomyid: sessionStorage.getItem("taxonomyid") !== null && sessionStorage.getItem("taxonomyid") !== undefined && sessionStorage.getItem("taxonomyid") !== ""
            ? Number(sessionStorage.getItem("taxonomyid"))
            : 1,
          difficultylevelid: Number(sessionStorage.getItem("difficultylevelid")) || 1,
          chaptercode: sessionStorage.getItem("selectedChapter") || "S12",
          creativitylevel:sessionStorage.getItem('selectedCreativityLevel'),
          locode: sessionStorage.getItem("selectedLO") || "",
          sourcetype: Number(sessionStorage.getItem("sourcetype")) || 1,
          referenceinfo: sessionStorage.getItem("referenceinfo") || "",
          selectedQuantity: noofquestions,
          noofquestions: noofquestions,
          agent_status: sessionStorage.getItem("agent_status") || "3"
        };
      }
      else{
  const question = 
  `Generate exactly ${noofquestions} Multiple Choice questions based exclusively on the ${studynumber} Study and study name is '${studyName}'. ${loClause} Each question must adhere to the specified Taxonomy: ${taxonomy}. Each question must reflect content strictly from the specified study material.
        Important:
        1.For options that are complete sentences, **add a period at the end**.
        2.For options that are not complete sentences (e.g., single words,double words, phrases), **do not add a period**.
        3.Do not provide options with missing punctuation or inconsistent use of periods.
        4.Options must start with prefix A, B, C... up to the number of distractors specified in 'selectedDistractor' (e.g., if selectedDistractor is 5, include options A to E). Ensure exactly ${selectedDistractor} options per question.
        5.If the Taxonomy is 'apply', each question should include a scenario.
        6.Options should be exactly ${selectedDistractor}
        7.All Options/distarctors should be in same length.
        8.Avoid decimal points in options and question stem, use whole numbers only.
        Ensure the options follow these punctuation rules strictly.
        Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages '' allocated to that learning objective. Clearly state that the page number must be drawn from this specified range only.
        Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows:
        [ { 'label': <Question>,
            'values': [<provide exactly ${selectedDistractor} Options with prefix A, B, C... up to z depending on the selectedDistractor.all distractors(options) should be in same length. Apply punctuation rules: complete sentences end with a period, phrases/words do not.>],
            'CorrectAnswer': <Correct option alphabet with full text. It must match one of the provided options (e.g., 'B. It is the correct definition.')>,
            'FeedbackOption<option>': <Correct/Incorrect.Feedback for the particular option. (e.g., 'FeedbackOptionA: Incorrect. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.','FeedbackOptionB: Correct. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.').In Json LHS side don't use the formate like this 'FeedbackOption<B>,FeedbackOption<A>...' use 'FeedbackOptionA,FeedbackOptionB..'.Must provide Feedback for the options >,
            'MaxMarks': 1,
            'LearningObjective': <for which learning objective question belongs to. Provide learning objective name,it should be same as in book, not number.do not give word like this 'Consider all learning objectives within study'>,
            'ReferenceInfo': <must provide study number(use study number 1st.do not use 'th','st','nd','rd' with numbers), Learning objective number, Page number. Not provide formate of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of 'Learning objective 1 : pages from ${Lo_Pnumber},'. Clearly state that the page number must be drawn from this specified range only.do not provide book name,study names and learning objective name.The format must be exactly as follows: 'Study ${studynumber}, Learning Objective <Learning Objective number>, Page <Page number>'.>,
            'BookName': <Book>,
            'creativityLevel':<this question belongs to which creativity level(moderate,high,very-high)>
        } ]
        The number of questions should be exactly ${noofquestions}.
        Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
        
        basePayload = {
          url: "Testing/IIC/CYBER_RISK",
          //question: "Generate exactly " + noofquestions + " Multiple Choice questions based exclusively on the "+studynumber+" Study and study name is '"+studyName+"'. The questions should align with the content of the study material and the corresponding Learning Objective:"+learningObj+",but **do not repeat or closely mirror the exact wording** of the LO statement. Instead, the questions should assess the application and deeper understanding of the content related to that learning objective.The questions must adhere to the specified Taxonomy:"+taxonomy+". Each question must reflect content strictly from the specified study material.Important: 1. For options that are complete sentences, **add a period at the end**.2. For options that are not complete sentences (e.g., single words,double words, phrases), **do not add a period**.3. Do not provide options with missing punctuation or inconsistent use of periods. 4. options must starts with prefix A., B., C., D.Ensure the options follow these punctuation rules strictly.Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages '' allocated to that learning objective. Clearly state that the page number must be drawn from this specified range only.Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows:[ { 'label': <Question>, 'values': [<provide Options with prefix ABCD.options must be added with period if option is complete sentence. If the option is not a complete sentence, do not add a period at the end.options must starts with prefix A, B, C, D>], 'CorrectAnswer': <Correct option alphabet with text. It also starts with the correct prefix (A, B, C, D).>, 'FeedbackOption<option>': <Correct/Incorrect. Feedback for the particular option>, 'MaxMarks': 1, 'LearningObjective': <for which learning objective question belongs to. Provide learning objective name,it should be same as in book, not number.do not give word like this 'Consider all learning objectives within study'>, 'ReferenceInfo': <must provide study number, Learning objective number, Page number. Not provide formate of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of 'Learning objective 1 : pages from 2-3 to 2-4,Learning objective 2 : pages from 2-4 to 2-13,Learning objective 3 : pages from 2-14 to 2-22,Learning objective 4 : pages from 2-23 to 2-25,Learning objective 5 : pages from 2-26 to 2-30,'. Clearly state that the page number must be drawn from this specified range only.do not provide book name,study names and learning objective name.The format must be exactly as follows: 'Study <Study Number>, Learning Objective <Learning Objective number>, Page <Page number>'.>, 'BookName': <Book> } ]The number of questions should be exactly " + noofquestions + ".Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.",
          //question: "Generate exactly " + noofquestions + " Multiple Choice questions based exclusively on the "+studynumber+" Study and study name is '"+studyName+"'. The questions should align with the content of the study material and the corresponding Learning Objective: "+learningObj+",but **do not repeat or closely mirror the exact wording** of the LO statement. Instead, the questions should assess the application and deeper understanding of the content related to that learning objective.The questions must adhere to the specified Taxonomy: "+taxonomy+". Each question must reflect content strictly from the specified study material.Important: 1. For options that are complete sentences, **add a period at the end**.2. For options that are not complete sentences (e.g., single words,double words, phrases), **do not add a period**.3. Do not provide options with missing punctuation or inconsistent use of periods. 4. options must starts with prefix A., B., C., D.Ensure the options follow these punctuation rules strictly.Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages '"+Lo_Pnumber+"' allocated to that learning objective. Clearly state that the page number must be drawn from this specified range only.Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows:[ { 'label': <Question>, 'values': [<provide Options with prefix ABCD.options must be added with period if option is complete sentence. If the option is not a complete sentence, do not add a period at the end.options must starts with prefix A, B, C, D>], 'CorrectAnswer': <Correct option alphabet with text. It also starts with the correct prefix (A, B, C, D).>, 'FeedbackOption<option>': <Correct/Incorrect. Feedback for the particular option>, 'MaxMarks': 1, 'LearningObjective': <for which learning objective question belongs to. Provide learning objective name,it should be same as in book, not number.do not give word like this 'Consider all learning objectives within study'>, 'ReferenceInfo': <must provide study number, Learning objective number, Page number. Not provide formate of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of '"+Lo_Pnumber+"'. Clearly state that the page number must be drawn from this specified range only.do not provide book name,study names and learning objective name.The format must be exactly as follows: 'Study <Study Number>, Learning Objective <Learning Objective number>, Page <Page number>'.>, 'BookName': <Book> } ]The number of questions should be exactly "+noofquestions+".Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.",
          question: question,
          source: sessionStorage.getItem("source") || "Book",
          custcode: sessionStorage.getItem("custcode") || custcode,
          orgcode: sessionStorage.getItem("orgcode") || orgcode,
          usercode: sessionStorage.getItem("usercode") || usercode,
          appcode: sessionStorage.getItem("appcode") || "IG",
          booknameid: sessionStorage.getItem("bookType"),
          questiontypeid: Number(sessionStorage.getItem("questiontypeid")) || 1,
          taxonomyid: sessionStorage.getItem("taxonomyid") !== null && sessionStorage.getItem("taxonomyid") !== undefined && sessionStorage.getItem("taxonomyid") !== ""
            ? Number(sessionStorage.getItem("taxonomyid"))
            : 1,
          difficultylevelid: Number(sessionStorage.getItem("difficultylevelid")) || 1,
          chaptercode: sessionStorage.getItem("selectedChapter") || "S12",
          creativitylevel:sessionStorage.getItem('selectedCreativityLevel'),
          locode: sessionStorage.getItem("selectedLO") || "",
          sourcetype: Number(sessionStorage.getItem("sourcetype")) || 1,
          referenceinfo: sessionStorage.getItem("referenceinfo") || "",
          selectedQuantity: noofquestions,
          noofquestions: noofquestions,
          agent_status: sessionStorage.getItem("agent_status") || "3"
        };
      }
    } else {
      // fallback: treat as written response if unknown
      basePayload = {
        url: "Testing/IIC/CYBER_RISK",
        question: "Generate exactly " + noofquestions + " Long Answer questions for " + pointValue + " marks. Questions based exclusively on the 1st Study and study name is 'Defining Risk and Cyber Risk'. The questions should align with the content of the study material and the corresponding Learning Objective: Explain why pure risk is insurable but speculative risk is not,but **do not repeat or closely mirror the exact wording** of the LO statement. Instead, the questions should assess the application and deeper understanding of the content related to that learning objective.The questions must adhere to the specified Taxonomy: Remember. Each question must reflect content strictly from the specified study material. Important: Ensure that the 'ReferenceInfo' includes the study number, the learning objective number, and a page number strictly within the range of pages 'Learning objective 1 : pages from 1-3 to 1-6,Learning objective 2 : pages from 1-7 to 1-14,Learning objective 3 : pages from 1-15 to 1-20,' allocated to that learning objective. Clearly state that the page number must be drawn from this specified range only..Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows:Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word. The output format should be in JSON, structured as follows: [{'label':<Question>, 'values':[],'CorrectAnswer':<Correct Answer(minimum 100 words)>,'KeyPoints':<List exactly 5 key points, each contributing 1 mark. Do not include any references, study numbers, learning objectives, examples, or page numbers within the key points. Focus only on the essential content of the chapter and format should be <Keypoint> - <Explanation of the key point> >,'MaxMarks':5,'BookName':<List the book name which have refered if possible>,LearningObjective': <for which learning objective question belongs to. Provide learning objective name,it should be same as in book, not number.do not give word like this 'Consider all learning objectives within study'>, 'ReferenceInfo': <must provide study number, Learning objective number,Page number. Not provide formate of  page number like 'page range:','within this page range:','from this page:'. Page number strictly within the range of 'Learning objective 1 : pages from 1-3 to 1-6,Learning objective 2 : pages from 1-7 to 1-14,Learning objective 3 : pages from 1-15 to 1-20,'. Clearly state that the page number must be drawn from this specified range only.do not provide book name,study names and learning objective name.The format must be exactly as follows: 'Study <Study Number>, Learning Objective <Learning Objective number>, Page <Page number>'.>}].The number of questions should be exactly "+noofquestions+".Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies. ",
        source: sessionStorage.getItem("source") || "Book",
        custcode: sessionStorage.getItem("custcode") || custcode,
        orgcode: sessionStorage.getItem("orgcode") || orgcode,
        usercode: sessionStorage.getItem("usercode") || usercode,
        appcode: sessionStorage.getItem("appcode") || "IG",
        booknameid: sessionStorage.getItem("bookType"),
        questiontypeid: Number(sessionStorage.getItem("questiontypeid")) || 1,
        taxonomyid: sessionStorage.getItem("taxonomyid") !== null && sessionStorage.getItem("taxonomyid") !== undefined && sessionStorage.getItem("taxonomyid") !== ""
          ? Number(sessionStorage.getItem("taxonomyid"))
          : 1,
        difficultylevelid: 1,
        chaptercode: sessionStorage.getItem("selectedChapter") || "S12",
        creativitylevel:sessionStorage.getItem('selectedCreativityLevel'),
        locode: sessionStorage.getItem("selectedLO") || "",
        sourcetype: Number(sessionStorage.getItem("sourcetype")) || 1,
        referenceinfo: sessionStorage.getItem("referenceinfo") || "",
        noofquestions: noofquestions,
      };
    }

    // Step 1: agent_status = "1"
    let response = await axios.post(
      ITEM_GEN_API_URL,
      { ...basePayload, agent_status: "1" }
    );
    let data = response.data;
    if (data.status === "A001") {
      if (data.agent_status) setAgentStatusObj && setAgentStatusObj(data.agent_status);
      setpleaswwaitmsg && setpleaswwaitmsg("agent 1");
      setCurrentStep && setCurrentStep(1);
      setProgress && setProgress(30);
      // Step 2: agent_status = "2"
      response = await axios.post(
        ITEM_GEN_API_URL,
        { ...basePayload, agent_status: "2" }
      );
      data = response.data;
      if (data.status === "A002") {
        if (data.agent_status) setAgentStatusObj && setAgentStatusObj(data.agent_status);
        setpleaswwaitmsg && setpleaswwaitmsg("agent 2");
        setCurrentStep && setCurrentStep(2);
        setProgress && setProgress(60);
        // Step 3: agent_status = "3"
        response = await axios.post(
          ITEM_GEN_API_URL,
          { ...basePayload, agent_status: "3" }
        );
        data = response.data;
        // Final step, store result and navigate to results
        if (data.agent_status) setAgentStatusObj && setAgentStatusObj(data.agent_status);
        setagentstatus && setagentstatus("1");
        setpleaswwaitmsg && setpleaswwaitmsg("agent 3");
        setCurrentStep && setCurrentStep(4);
        setProgress && setProgress(100);
        // Store the result in localStorage for /question-results page
        try {
          sessionStorage.setItem("questionGenResults", JSON.stringify(data));
        } catch (e) {
          console.error("Failed to store questionGenResults in localStorage", e);
        }
        setTimeout(() => {
          navigate && navigate("/question-results");
        }, 1000);
      }
    }
  } catch (error) {
    console.error("Error in item generation:", error);
  }
};
import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Brain, Check, Zap, Target, Shield, Sparkles, Cpu, Database, Lightbulb, Pointer } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { sendStep1API, sendStep2API, sendStep3API } from "@/api";
const QuestionGenerationLoading = () => {
  const navigate = useNavigate()
  const location = useLocation();
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  // Optionally, add these if you want to show agent status messages
  const [agentStatusObj, setAgentStatusObj] = useState(null);
  const [pleaswwaitmsg, setpleaswwaitmsg] = useState("");
  const [agentstatus, setagentstatus] = useState("");
const isSSO = sessionStorage.getItem('isSSO') === 'true';
  const steps = [
    {
      title: "Analyzing Source Material",
      subtitle: "Processing document content and structure",
      status: "complete"
    },
    {
      title: "Understanding Context",
      subtitle: "Extracting key concepts and learning objectives",
      status: "complete"
    },
    // {
    //   title: "Generating Questions",
    //   subtitle: "Creating contextually relevant questions",
    //   status: "complete"
    // },
    // {
    //   title: "Optimizing Quality",
    //   subtitle: "Ensuring question clarity and accuracy",
    //   status: "processing"
    // },
    {
      title: "Generating & Finalizing Results",
      subtitle: "Preparing your assessment questions",
      status: "pending"
    }
  ]

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
    // If data is passed from QuestionGenerator, use real API logic
    if (location.state) {
      initiateItemGeneration(
        location.state,
        setCurrentStep,
        setProgress,
        navigate,
        setAgentStatusObj,
        setpleaswwaitmsg,
        setagentstatus
      );
      return;
    }
    // Fallback: simulate progress if no data
    const handleStepProgress = async () => {
      try {
        // Step 1
        const input1 = { a: "valueA", b: "valueB" };
        const result1 = await sendStep1API(input1);
        setCurrentStep(1);
        setProgress(30);
        // Step 2
        const input2 = { paramFromStep1: result1.someValue, extra: "more" };
        const result2 = await sendStep2API(input2);
        setCurrentStep(2);
        setProgress(60);
        // Step 3
        const input3 = { paramFromStep2: result2.output };
        const result3 = await sendStep3API(input3);
        setCurrentStep(3);
        setProgress(90);
        setProgress(100);
        setTimeout(() => {
          navigate("/question-results");
        }, 1000);
      } catch (error) {
        console.error("Error in step progression:", error);
      }
    };
    handleStepProgress();
  }, [navigate, location.state])

  const getStepStatus = (index: number) => {
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
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">AL</span>
          </div>
          <img
            src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
            alt="AI-Levate"
            className="h-6 w-auto"
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
              AI is Generating Your Questions
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
              Our AI is analyzing your content and creating high-quality assessment questions.
            </p>
          </div>

          {/* Progress Section */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-800">Processing Progress</span>
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
              Please wait while our AI processes your request. This may take a few moments...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuestionGenerationLoading