import axios from "axios";
import { withCustOrgCodes } from './utils/custOrgCodes';

// Environment variables for API base URLs
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_QUIZ_URL = import.meta.env.VITE_API_QUIZ_URL;
const API_APPS_URL = import.meta.env.VITE_API_APPS_URL;
const VITE_ITEM_GEN_API_URL = import.meta.env.VITE_ITEM_GEN_API_URL;

// Learning Objective (LO) interface and API
export interface LearningObjective {
  loCode: string;
  loName: string;
  // Add more fields if the API returns them
}

/**
 * Fetch learning objectives for a given chapter code
 * @param chapterCode The code of the chapter
 */
export const getLearningObjectives = async (chapterCode: string): Promise<LearningObjective[]> => {
  const response = await fetch(withCustOrgCodes(`${VITE_ITEM_GEN_API_URL}/lo?chaptercode=${chapterCode}`),
    {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch learning objectives (status: ${response.status})`);
  }
  const data = await response.json();
  // Defensive: handle if API returns { data: [...] } or just an array
  let los: any[] = [];
  if (Array.isArray(data)) {
    los = data;
  } else if (data && Array.isArray(data.data)) {
    los = data.data;
  }
  // Filter out empty/invalid LOs
  return los.filter((lo) => lo && (lo.loCode || lo.loName));
};



export const loginUser = async (username: string, password: string): Promise<any> => {
  // First, try logging in with the provided username as email
  let response = await fetch(`${API_BASE_URL}/aiapps/Login/LoginAIProduct`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: '*/*',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: JSON.stringify({
      email: username,
      password: password,
      appcode: "AIProduct",
    }),
  });

  if (!response.ok) {
    throw new Error("Network error during login");
  }

  let data = await response.json();
  if (data.status === "S001" && data.data?.length > 0) {
    localStorage.setItem("user", JSON.stringify(data.data[0]));
    return data.data[0];
  } else if (data.status === "F001") {
    throw new Error(data.message || "Invalid username or password");
  } else {
    throw new Error("Invalid username or password");
  }
};


export interface RegisterPayload {
  firstname: string;
  lastname: string;
  email: string;
  contactnumber: string;
  orgname: string;
  username: string;
  password: string;
  createdBy?: string;
  userID?: number;
}

export interface RegisterResponse {
  status: string;
  message: string;
  data?: any;
}

export const registerUser = async (payload: RegisterPayload): Promise<RegisterResponse> => {
  try {
    const response = await axios.post(`${API_BASE_URL}/aiapps/AIProductApi/signup`, {
      ...payload,
      createdBy: payload.createdBy || "",
      userID: payload.userID || 0
    }, {
      headers: {
        'Content-Type': 'application/json',
        accept: '*/*',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

    const result = response.data;

    // Handle various response status codes
    if (result.status === "S001") {
      return {
        status: result.status,
        message: "Registration successful",
        data: result.data
      };
    } else if (result.status === "FL001") {
      throw new Error("User already exists");
    } else if (result.status === "O001") {
      throw new Error("Organization already exists");
    } else if (result.status === "LO001") {
      throw new Error("Username already exists");
    } else if (result.status === "EM001") {
      throw new Error("Email already exists");
    } else {
      throw new Error(result.message || "Registration failed");
    }
  } catch (error: any) {
    // Handle axios errors and custom errors
    if (error.response) {
      // Server responded with error status
      throw new Error(error.response.data?.message || "Registration failed");
    } else if (error.message) {
      // Use custom error message or axios network error
      throw new Error(error.message);
    } else {
      // Fallback error
      throw new Error("Registration failed. Please try again later.");
    }
  }
}


// src/api/apps.ts

export interface AppDetail {
  appCode: string;
  appDescription: string;
  appID: number;
  applicationName: string;
  applicationURL: string;
  isSubscribed: number;
  isTagged: boolean;
}

export const getAppDetails = async (
  usercode: string,
  orgcode: string,
  subscription: number
): Promise<AppDetail[]> => {
  const url = `${API_APPS_URL}/get_app_details?usercode=${usercode}&orgcode=${orgcode}&subscription=${subscription}`;
  const response = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch app details: ${response.statusText}`);
  }
  const data = await response.json();
  return data.app_details || [];
};


export interface UsageRequestPayload {
  custcode: string;
  orgcode: string;
  usercode: string;
  appcode: string;
  type: number;
}

export const fetchUsageStats = async (payload: UsageRequestPayload): Promise<number[]> => {
  const response = await fetch(`${VITE_ITEM_GEN_API_URL}/get_usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error("Failed to fetch usage stats");

  return await response.json(); // returns an array like [164130, 0, 30000, ...]
};

export interface BookUsage {
  title: string;
  bookCode: string;
  totalQuestions: number;
  totalTokensUsed: string;
  savedQuestions: string;
  bookmarkedQuestions: string;
  bookType: number;
  imagePath: string;
  bookPath: string;
}

export const getBookWiseUsage = async (
  usercode: string,
  orgcode: string,
  custcode: string,
  appcode: string
): Promise<BookUsage[]> => {
  const response = await fetch(`${VITE_ITEM_GEN_API_URL}/get_usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: JSON.stringify({
      custcode,
      orgcode,
      usercode,
      appcode,
      type: 2
    })
  });

  if (!response.ok) {
    throw new Error("Failed to fetch book-wise usage");
  }

  const raw = await response.json();

  return raw.map((item: any[]) => ({
    title: item[0],
    bookCode: item[1],
    totalQuestions: Number(item[2]),
    totalTokensUsed: item[3],
    savedQuestions: item[4],
    bookmarkedQuestions: item[5],
    bookType: item[6],
    imagePath: item[7],
    bookPath: item[8]
  }));
};


// src/api/index.ts or src/api/chapters.ts

export interface Chapter {
  chapterCode: string;
  chapterName: string;
  // Add more fields if the response has them
}

export const getChapters = async (bookCode: string): Promise<Chapter[]> => {
  const response = await fetch(withCustOrgCodes(`${VITE_ITEM_GEN_API_URL}/chapter?bookcode=${bookCode}`));
  if (!response.ok) {
    throw new Error(`Failed to fetch chapters (status: ${response.status})`);
  }
  const data = await response.json();
  // Defensive: handle if API returns { data: [...] } or just an array
  let chapters: any[] = [];
  if (Array.isArray(data)) {
    chapters = data;
  } else if (data && Array.isArray(data.data)) {
    chapters = data.data;
  }
  // Filter out empty/invalid chapters
  return chapters.filter(
    (c) => c && (c.chapterCode || c.chapterName)
  );
};


// src/api/dropdownLoader.ts

export interface DropdownOption {
  code: string;
  name: string;
  // Add more fields if needed based on actual response structure
}

export const fetchDropdownOptions = async (): Promise<DropdownOption[]> => {
  const custcode = localStorage.getItem("custcode") || "";
  const orgcode = localStorage.getItem("orgcode") || "";
  const appcode = localStorage.getItem("appcode") || "IG";

  const response = await fetch(`${VITE_ITEM_GEN_API_URL}/dropdownloader`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: JSON.stringify({ custcode, orgcode, appcode })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch dropdown options (status ${response.status})`);
  }

  const data = await response.json();
  return data; // Adjust if response structure is nested
};

const BASE_URL = `${VITE_ITEM_GEN_API_URL}`;

export interface ItemGenInput {
  url: string;
  question: string;
  source: string;
  booknameid: number;
  questiontypeid: number;
  taxonomyid: number;
  difficultylevelid: number;
  chaptercode: string;
  locode?: string;
  sourcetype: number;
  referenceinfo?: string;
  noofquestions: number;
}

export const generateItem = async (input: ItemGenInput) => {
  const custcode = localStorage.getItem("custcode");
  const orgcode = localStorage.getItem("orgcode");
  const usercode = localStorage.getItem("usercode");
  const appcode = localStorage.getItem("appcode");

  const payload = {
    ...input,
    custcode,
    orgcode,
    usercode,
    appcode,
  };

  const response = await axios.post(`${VITE_ITEM_GEN_API_URL}/item_gen`, payload, {
    headers: {
      "Content-Type": "application/json",
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
  });
  return response.data;
};

interface GetFromDBInput {
  custcode: string;
  orgcode: string;
  usercode: string;
  appcode: string;
  booknameid: number;
  chaptercode: string;
  locode: string;
  questiontypeid: number;
  taxonomyid: number;
  difficultlevelid: number;
  questionrequestid: number;
  questionid: number;
  sourcetype: number;
  pagesize: number;
  pageno: number;
  usertypeid: number;
  searchtext: string;
}

export const getFromDB = async (input: GetFromDBInput): Promise<any> => {
  const response = await axios.post(
    `${VITE_ITEM_GEN_API_URL}/get_from_db`,
    input,
    {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
};

// src/api/deleteQuestion.ts


export interface DeleteQuestionInput {
  questionid: number;
  questionrequestid: number;
  usercode: string;
}

export const deleteQuestion = async (
  input: DeleteQuestionInput
): Promise<boolean> => {
  const res = await axios.post(
    `${VITE_ITEM_GEN_API_URL}/delete-question`,
    input,
    {
      headers: {
        "Content-Type": "application/json",
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  );

  //console.log("Delete API response:", res.data);

  const status = res.data?.status?.[0]?.[0];
  return status === "S001";
};

export const subscribeToApp = async (
  usercode: string,
  orgcode: string,
  appcode: string
): Promise<{ success: boolean; message: string; data: any }> => {
  const response = await axios.post(
    `${API_APPS_URL}/subscribe_app`,
    { usercode, orgcode, appcode },
    {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
};























// Simulate API 1
export const sendStep1API = (input: any): Promise<any> => {
  return new Promise((resolve) => {
    //console.log("API 1 input:", input);
    setTimeout(() => {
      resolve({ someValue: "step1-success" });
    }, 1000); // 1 second delay
  });
};

// Simulate API 2
export const sendStep2API = (input: any): Promise<any> => {
  return new Promise((resolve) => {
    //console.log("API 2 input:", input);
    setTimeout(() => {
      resolve({ output: "step2-success" });
    }, 1000);
  });
};

// Simulate API 3
export const sendStep3API = (input: any): Promise<any> => {
  return new Promise((resolve) => {
    //console.log("API 3 input:", input);
    setTimeout(() => {
      resolve({ result: "step3-success" });
    }, 1000);
  });
};




export interface UpdateQuestionInput {
  id: string;
  questionrequestid: string;
  question: string;
  type: string;
  options: string[];
  correct: number;
  feedback?: string;
  [key: string]: any;
}

export const updateQuestion = async (input: UpdateQuestionInput): Promise<any> => {
  const res = await axios.post(
    `${VITE_ITEM_GEN_API_URL}/update-question`,
    input,
    {
      headers: {
        "Content-Type": "application/json",
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  );
  return res.data;
};
