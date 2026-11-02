import React, { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImagePlus, Upload, X, BookOpen, Layers, Target, Loader2, Trash2, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { buildImageScopePrefix, resolveImageScope } from "@/utils/imageRepoPath";
import { listScopedImagesByPath, appendImageScopeFields } from "@/utils/imageRepoApi";
import RepoImage from "@/components/RepoImage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SuperAdminSidebar } from "@/components/SuperAdminSidebar";
import { getKbAuthToken } from "@/lib/kb-auth";
import { API_ENDPOINTS } from "@/config";
import { AGENT_GENERATIVE_API_URL } from "@/utils/Aigapi";

const ImageRepository = () => {

  const [isSuperAdmin, setIsSuperAdmin] = useState(() => {
    try {
      const role = sessionStorage.getItem("userRole") || "";
      if (role) return role.toLowerCase() === "superadmin";
      const uiRaw = sessionStorage.getItem("userInfo");
      if (uiRaw) {
        const ui = JSON.parse(uiRaw);
        return String(ui?.userRole || ui?.role || "").toLowerCase() === "superadmin";
      }
      return false;
    } catch {
      return false;
    }
  });

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  // Dropdown states
  const [selectedBook, setSelectedBook] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedLO, setSelectedLO] = useState("");

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Data states
  const [books, setBooks] = useState<any[]>([]);
  const [chapterLOs, setChapterLOs] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [los, setLOs] = useState<any[]>([]);

  // Loading states
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [loadingChapterLOs, setLoadingChapterLOs] = useState(false);

  const [images, setImages] = useState<any[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string>("");
  const [imageToDelete, setImageToDelete] = useState<any>(null);

  // Filtered images based on text search query
  const filteredImages = images.filter((img) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const filename = String(img.filename || img.name || img.path || '').toLowerCase();
    return filename.includes(q);
  });

  // 1. Fetch Books
  useEffect(() => {
    const fetchBooks = async () => {
      setLoadingBooks(true);
      try {
        const token = await getKbAuthToken();
        const custcode = sessionStorage.getItem("customerCode") || sessionStorage.getItem("custcode") || "ES";
        const orgcode = sessionStorage.getItem("orgCode") || sessionStorage.getItem("orgcode") || "Exc195";

        const response = await fetch(API_ENDPOINTS.GET_BOOKS_DETAILS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            par_customercode: custcode,
            par_organizationcode: orgcode,
            par_appcode: "",
            auth_token: token,
          }),
        });

        const data = await response.json();
        const booksList = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
        setBooks(booksList);
      } catch (error) {
        console.error("Failed to fetch books:", error);
        toast({ title: "Error", description: "Failed to load books.", variant: "destructive" });
      } finally {
        setLoadingBooks(false);
      }
    };

    fetchBooks();
  }, []);

  // 2. Fetch Chapters & LOs when Book is selected
  useEffect(() => {
    if (!selectedBook) {
      setChapterLOs([]);
      setChapters([]);
      setLOs([]);
      return;
    }

    const fetchChapterLOs = async () => {
      setLoadingChapterLOs(true);
      try {
        const token = await getKbAuthToken();
        const response = await fetch(API_ENDPOINTS.GET_CHAPTER_LO_DETAILS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            par_bookid: Number(selectedBook),
            auth_token: token,
          }),
        });

        const data = await response.json();
        const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
        setChapterLOs(list);

        const uniqueChapters = Array.from(new Set(list.map((item: any) => item.chapternameid || item.chapterid || item.chapter_id || item.chaptercode || item.chapterCode || item.chapter_code || item.chaptername || item.chapter_name)))
          .map(code => {
            return list.find((item: any) => (item.chapternameid || item.chapterid || item.chapter_id || item.chaptercode || item.chapterCode || item.chapter_code || item.chaptername || item.chapter_name) === code);
          })
          .filter(Boolean);

        setChapters(uniqueChapters);

        setSelectedChapter("");
        setSelectedLO("");
      } catch (error) {
        console.error("Failed to fetch chapters & LOs:", error);
        toast({ title: "Error", description: "Failed to load chapters and LOs.", variant: "destructive" });
      } finally {
        setLoadingChapterLOs(false);
      }
    };

    fetchChapterLOs();
  }, [selectedBook]);

  // 4. Fetch Images based on selection
  useEffect(() => {
    const fetchImages = async () => {
      setLoadingImages(true);
      try {
        const token = await getKbAuthToken();

        let folderPath = "";

        if (selectedBook) {
          const bookObj = books.find(b => String(b.bookdetails_id || b.id || b.bookcode) === selectedBook);
          const bookName = (bookObj?.bookname || bookObj?.bookTitle || bookObj?.name || selectedBook).replace(/[/\\?%*:|"<> ]/g, '_');
          folderPath = `${bookName}/`;

          if (selectedChapter) {
            const chapterObj = chapters.find(c => String(c.chaptercode || c.chapterCode || c.chapter_code || c.chapternameid || c.chapterid) === selectedChapter);
            const chapterName = (chapterObj?.chaptername || chapterObj?.chapterName || chapterObj?.chapter_name || selectedChapter).replace(/[/\\?%*:|"<> ]/g, '_');
            folderPath += `${chapterName}/`;

            if (selectedLO) {
              const loObj = los.find(l => String(l.locode || l.loCode || l.lo_code || l.learningoutcomenameid || l.loid) === selectedLO);
              const loName = (loObj?.loname || loObj?.loName || loObj?.lo_name || loObj?.learningoutcomename || selectedLO).replace(/[/\\?%*:|"<> ]/g, '_');
              folderPath += `${loName}/`;
            }
          }
        }

        // Reads the Customer/Organisation folder AND the unscoped one older images
        // were written to, merged, so nothing visible today disappears. `folderPath`
        // is already the book/chapter/LO part; the scope is added by the helper.
        setImages(await listScopedImagesByPath(token, folderPath));
      } catch (error) {
        console.error("Failed to fetch images:", error);
        toast({ title: "Error", description: "Failed to load images from the repository.", variant: "destructive" });
      } finally {
        setLoadingImages(false);
      }
    };

    fetchImages();
  }, [selectedBook, books, selectedChapter, selectedLO, chapters, los, refreshKey, isUploadOpen]);

  useEffect(() => {
    if (!selectedChapter) {
      setLOs([]);
      return;
    }

    const filteredLOs = chapterLOs.filter(
      (item: any) => String(item.chapternameid || item.chapterid || item.chapter_id || item.chaptercode || item.chapterCode || item.chapter_code || item.chaptername || item.chapter_name) === selectedChapter
    );

    const uniqueLOs = Array.from(new Set(filteredLOs.map((item: any) => item.learningoutcomenameid || item.loid || item.lo_id || item.locode || item.loCode || item.lo_code || item.learningoutcomename || item.loname || item.lo_name)))
      .map(code => {
        return filteredLOs.find((item: any) => (item.learningoutcomenameid || item.loid || item.lo_id || item.locode || item.loCode || item.lo_code || item.learningoutcomename || item.loname || item.lo_name) === code);
      })
      .filter(Boolean);

    setLOs(uniqueLOs);
    setSelectedLO("");
  }, [selectedChapter, chapterLOs]);

  // Individual images are capped at 5 MB. A .zip is a bulk upload of many images and
  // is legitimately larger, so the cap deliberately does not apply to archives.
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const picked = Array.from(e.target.files);
    const isArchive = (file: File) => /\.zip$/i.test(file.name);
    const oversized = picked.filter(file => !isArchive(file) && file.size > MAX_IMAGE_BYTES);
    const allowed = picked.filter(file => isArchive(file) || file.size <= MAX_IMAGE_BYTES);

    if (oversized.length > 0) {
      const tooBig = oversized
        .map(file => `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`)
        .join(', ');
      toast({
        title: "Image too large",
        description: `Please add an image less than 5 MB. Skipped: ${tooBig}`,
        variant: "destructive",
      });
    }

    setSelectedFiles(allowed);
    if (allowed.length === 0) e.target.value = "";
  };

  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      toast({ title: "Error", description: "Please select at least one file (.zip or images)", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const token = await getKbAuthToken();
      const formData = new FormData();

      let folderPath = "";

      if (selectedBook) {
        const bookObj = books.find(b => String(b.bookdetails_id || b.id || b.bookcode) === selectedBook);
        const bookName = (bookObj?.bookname || bookObj?.bookTitle || bookObj?.name || selectedBook).replace(/[/\\?%*:|"<> ]/g, '_');
        folderPath = `${bookName}/`;

        if (selectedChapter) {
          const chapterObj = chapters.find(c => String(c.chaptercode || c.chapterCode || c.chapter_code || c.chapternameid || c.chapterid) === selectedChapter);
          const chapterName = (chapterObj?.chaptername || chapterObj?.chapterName || chapterObj?.chapter_name || selectedChapter).replace(/[/\\?%*:|"<> ]/g, '_');
          folderPath += `${chapterName}/`;

          if (selectedLO) {
            const loObj = los.find(l => String(l.locode || l.loCode || l.lo_code || l.learningoutcomenameid || l.loid) === selectedLO);
            const loName = (loObj?.loname || loObj?.loName || loObj?.lo_name || loObj?.learningoutcomename || selectedLO).replace(/[/\\?%*:|"<> ]/g, '_');
            folderPath += `${loName}/`;
          }
        }
      }

      // Everything is stored under Customer/Organisation; with none known the prefix
      // is empty and the path is exactly what it was before.
      const { custCode, orgCode } = resolveImageScope();
      const scopedFolderPath = `${buildImageScopePrefix(custCode, orgCode)}${folderPath}`;
      console.log("Uploading to folder path:", scopedFolderPath);

      formData.append("folder_path", scopedFolderPath);
      formData.append("book_id", selectedBook);
      formData.append("auth_token", token);
      // Sent alongside the path so the server can apply the same scoping.
      appendImageScopeFields(formData);

      selectedFiles.forEach((file) => formData.append("files", file));

      toast({ title: "Uploading...", description: `Uploading ${selectedFiles.length} file(s) to ${folderPath}` });

      const response = await fetch(`${AGENT_GENERATIVE_API_URL}/upload-images`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      toast({ title: "Success", description: "Images uploaded successfully" });
      console.log("Uploaded URLs:", data.urls);

      setIsUploadOpen(false);
      setSelectedFiles([]);
      setRefreshKey(prev => prev + 1);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Error", description: error.message || "Failed to upload images", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (img: any) => {
    const blobPath = img?.path || "";
    if (!blobPath) {
      toast({ title: "Error", description: "Unable to determine the image to delete.", variant: "destructive" });
      setImageToDelete(null);
      return;
    }

    setDeletingPath(blobPath);
    try {
      const token = await getKbAuthToken();
      const response = await fetch(
        `${AGENT_GENERATIVE_API_URL}/delete-image?path=${encodeURIComponent(blobPath)}&auth_token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );

      if (!response.ok) throw new Error("Delete failed");

      setImages(prev => prev.filter(i => i.path !== blobPath));
      toast({ title: "Deleted", description: "Image removed from the repository." });
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({ title: "Error", description: error.message || "Failed to delete image", variant: "destructive" });
    } finally {
      setDeletingPath("");
      setImageToDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-52 z-40 hidden lg:block">
        {isSuperAdmin ? <SuperAdminSidebar /> : <AppSidebar />}
      </div>

      {/* Main Content */}
      <div className="flex-1 lg:ml-52 flex flex-col min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <ImagePlus className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Image Repository
              </h2>
              <p className="text-sm text-gray-500">
                Manage and upload your image assets
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ProfileDropdown />
          </div>
        </div>

        {/* Dashboard/Content Area */}
        <div className="p-6 flex-1 flex flex-col">
          <div className="flex flex-col flex-1 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Browse Repository</h3>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search images by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8 h-9 text-xs bg-white border-gray-200"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <Button onClick={() => setIsUploadOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex-shrink-0">
                  <Upload className="w-4 h-4 mr-2" /> Upload Images
                </Button>
              </div>
            </div>

            {/* 3 Dropdowns always visible in view mode */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#F8FAFF] rounded-xl p-5 border border-blue-100 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-base font-semibold text-blue-900">Book Information</span>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-2 block">
                    Select Book
                  </Label>
                  <Select value={selectedBook} onValueChange={setSelectedBook} disabled={loadingBooks}>
                    <SelectTrigger className="h-10 bg-white border-gray-200 w-full">
                      <SelectValue placeholder={loadingBooks ? "Loading books..." : "Select Book"} />
                    </SelectTrigger>
                    <SelectContent>
                      {books.map((b: any) => (
                        <SelectItem key={b.bookdetails_id || b.id || b.bookcode || Math.random()} value={String(b.bookdetails_id || b.id || b.bookcode)}>
                          {b.bookname || b.bookTitle || b.name || "Unnamed Book"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-[#F8FAFF] rounded-xl p-5 border border-blue-100 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-base font-semibold text-blue-900">Chapter Information</span>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-2 block">
                    Select Chapter
                  </Label>
                  <Select value={selectedChapter} onValueChange={setSelectedChapter} disabled={!selectedBook || loadingChapterLOs}>
                    <SelectTrigger className="h-10 bg-white border-gray-200 w-full">
                      <SelectValue placeholder={loadingChapterLOs ? "Loading chapters..." : "Select Chapter"} />
                    </SelectTrigger>
                    <SelectContent>
                      {chapters.map((c: any) => (
                        <SelectItem key={c.chaptercode || c.chapterCode || c.chapter_code || c.chapternameid || c.chapterid || Math.random()} value={String(c.chaptercode || c.chapterCode || c.chapter_code || c.chapternameid || c.chapterid || c.chaptername || c.chapter_name)}>
                          {c.chaptername || c.chapterName || c.chapter_name || c.chaptercode || "Unnamed Chapter"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-[#F8FAFF] rounded-xl p-5 border border-blue-100 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-base font-semibold text-blue-900">LO Information</span>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-2 block">
                    Select LO
                  </Label>
                  <Select value={selectedLO} onValueChange={setSelectedLO} disabled={!selectedChapter || loadingChapterLOs}>
                    <SelectTrigger className="h-10 bg-white border-gray-200 w-full">
                      <SelectValue placeholder="Select LO" />
                    </SelectTrigger>
                    <SelectContent>
                      {los.map((l: any) => (
                        <SelectItem key={l.locode || l.loCode || l.lo_code || l.learningoutcomenameid || l.loid || Math.random()} value={String(l.locode || l.loCode || l.lo_code || l.learningoutcomenameid || l.loid || l.learningoutcomename || l.loname || l.lo_name)}>
                          {l.loname || l.loName || l.lo_name || l.learningoutcomename || l.locode || "Unnamed LO"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Display Images Area */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex-1 min-h-[400px]">
              {loadingImages ? (
                <div className="h-full flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
                  <p className="text-gray-500">Loading images from repository...</p>
                </div>
              ) : filteredImages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                    {searchQuery ? <Search className="w-8 h-8 text-gray-400" /> : <ImagePlus className="w-8 h-8 text-gray-400" />}
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchQuery
                      ? `No images matching "${searchQuery}"`
                      : (!selectedBook ? "General Images" : "No Images Found")}
                  </h3>
                  <p className="text-gray-500 max-w-sm mb-4">
                    {searchQuery
                      ? "Try searching for a different image name or keyword."
                      : "There are no images associated with this selection yet. Click the upload button to add some."}
                  </p>
                  {searchQuery && (
                    <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                      Clear Search
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {filteredImages.map((img, idx) => {
                    return (
                      <div key={idx} className="group relative aspect-square border border-gray-200 rounded-lg overflow-hidden bg-gray-50 hover:shadow-md transition-all">
                        {/* list-images returns unsigned blob URLs, which Azure
                            rejects for anonymous callers. RepoImage catches the
                            failure and retries with a freshly-signed URL. */}
                        <RepoImage
                          src={img.backend_download_url || img.url}
                          alt={img.filename || img.name || 'Repository image'}
                          className="w-full h-full object-contain p-2"
                          loading="lazy"
                        />
                        <button
                          type="button"
                          onClick={() => setImageToDelete(img)}
                          disabled={deletingPath === img.path}
                          title="Delete image"
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white text-red-600 hover:bg-red-600 hover:text-white shadow-md ring-1 ring-red-200 flex items-center justify-center transition-all disabled:opacity-50"
                        >
                          {deletingPath === img.path
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 transform translate-y-full group-hover:translate-y-0 transition-transform">
                          <p className="text-xs text-white truncate" title={img.filename || img.name}>
                            {img.filename || img.name || 'Image'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Images Modal Popup */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6 bg-white rounded-xl shadow-xl">
          <DialogHeader className="border-b pb-4 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Upload className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-gray-900">Upload Images</DialogTitle>
                <p className="text-sm text-gray-500 mt-0.5">Upload image files or .zip archives into your selected book, chapter, or LO folder</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {/* Dropdowns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#F8FAFF] rounded-xl p-4 border border-blue-100 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-blue-900">Book Information</span>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    Select Book
                  </Label>
                  <Select value={selectedBook} onValueChange={setSelectedBook} disabled={loadingBooks}>
                    <SelectTrigger className="h-9 bg-white border-gray-200 w-full text-xs">
                      <SelectValue placeholder={loadingBooks ? "Loading books..." : "Select Book"} />
                    </SelectTrigger>
                    <SelectContent>
                      {books.map((b: any) => (
                        <SelectItem key={b.bookdetails_id || b.id || b.bookcode || Math.random()} value={String(b.bookdetails_id || b.id || b.bookcode)}>
                          {b.bookname || b.bookTitle || b.name || "Unnamed Book"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-[#F8FAFF] rounded-xl p-4 border border-blue-100 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-blue-900">Chapter Information</span>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    Select Chapter
                  </Label>
                  <Select value={selectedChapter} onValueChange={setSelectedChapter} disabled={!selectedBook || loadingChapterLOs}>
                    <SelectTrigger className="h-9 bg-white border-gray-200 w-full text-xs">
                      <SelectValue placeholder={loadingChapterLOs ? "Loading chapters..." : "Select Chapter"} />
                    </SelectTrigger>
                    <SelectContent>
                      {chapters.map((c: any) => (
                        <SelectItem key={c.chaptercode || c.chapterCode || c.chapter_code || c.chapternameid || c.chapterid || Math.random()} value={String(c.chaptercode || c.chapterCode || c.chapter_code || c.chapternameid || c.chapterid || c.chaptername || c.chapter_name)}>
                          {c.chaptername || c.chapterName || c.chapter_code || c.chaptercode || "Unnamed Chapter"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-[#F8FAFF] rounded-xl p-4 border border-blue-100 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <Target className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-blue-900">LO Information</span>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    Select LO
                  </Label>
                  <Select value={selectedLO} onValueChange={setSelectedLO} disabled={!selectedChapter || loadingChapterLOs}>
                    <SelectTrigger className="h-9 bg-white border-gray-200 w-full text-xs">
                      <SelectValue placeholder="Select LO" />
                    </SelectTrigger>
                    <SelectContent>
                      {los.map((l: any) => (
                        <SelectItem key={l.locode || l.loCode || l.lo_code || l.learningoutcomenameid || l.loid || Math.random()} value={String(l.locode || l.loCode || l.lo_code || l.learningoutcomenameid || l.loid || l.learningoutcomename || l.loname || l.lo_name)}>
                          {l.loname || l.loName || l.lo_name || l.learningoutcomename || l.locode || "Unnamed LO"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* File Upload Input */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <Upload className="w-3.5 h-3.5 text-teal-700" />
                </div>
                <span className="text-sm font-semibold text-gray-900">File Uploads</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fileUploadModal" className="text-xs font-semibold text-gray-700">Select Files (Images or .zip)</Label>
                <Input
                  id="fileUploadModal"
                  type="file"
                  accept="image/*,.zip"
                  multiple
                  onChange={handleFileChange}
                  className="cursor-pointer text-xs"
                />
              </div>

              {selectedFiles.length > 0 && (
                <div className="text-xs text-gray-600 mt-2 max-h-36 overflow-y-auto border rounded-md p-3 bg-gray-50">
                  <p className="font-semibold mb-1.5 text-gray-800">Selected {selectedFiles.length} file(s):</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {selectedFiles.map((file, idx) => (
                      <li key={idx}>
                        {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => {
                setIsUploadOpen(false);
                setSelectedFiles([]);
              }}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={uploading} className="bg-blue-600 hover:bg-blue-700 text-white">
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" /> Upload
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation popup */}
      <AlertDialog open={!!imageToDelete} onOpenChange={(open) => { if (!open) setImageToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete image?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-medium text-gray-900">"{imageToDelete?.filename || imageToDelete?.name || 'this image'}"</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingPath}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteImage(imageToDelete); }}
              disabled={!!deletingPath}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deletingPath ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ImageRepository;
